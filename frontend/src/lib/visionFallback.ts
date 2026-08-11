import { openCodeApi } from "@/lib/opencode";
import type { AssistantMessage, ModelInfo, ModelRef, PromptAttachment } from "@/lib/opencode";
import { t } from "@/lib/i18n";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const assistantText = (message: AssistantMessage): string =>
  message.content
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();

/**
 * Whether this model can be sent an image at all.
 *
 * Read from `capabilities.input`, which is what the running model list reports — `modalities` is
 * the shape of the *configuration* entry and is absent from the catalogue the panel receives.
 */
export const modelAcceptsImages = (model?: ModelInfo): boolean =>
  model?.capabilities?.input?.image === true;

const isImage = (attachment: PromptAttachment): boolean => attachment.mime.startsWith("image/");

export interface VisionFallbackInput {
  attachments: PromptAttachment[];
  projectPath: string;
  /** The model that will read the description — used only to word the request. */
  targetModelID?: string;
  visionModel: ModelRef;
}

export interface VisionFallbackResult {
  /** Attachments to actually send: the images have been removed. */
  attachments: PromptAttachment[];
  /** Text to append to the prompt, empty when nothing was converted. */
  text: string;
}

/**
 * Turns images into text for a model that cannot see them.
 *
 * Nothing about the conversation model changes: the images are described by a second model in a
 * throwaway session — the same trick the commit-message generator uses — and only the description
 * travels on. Without this an image sent to a text-only model is either rejected outright or, on
 * some relays, silently dropped, which is worse: the user sees their screenshot in the transcript
 * and gets an answer that ignored it.
 *
 * Images are described one at a time so a failure on the third does not discard the first two, and
 * so each description can be attributed to a named file.
 */
export async function describeImagesForTextModel({
  attachments,
  projectPath,
  visionModel,
}: VisionFallbackInput): Promise<VisionFallbackResult> {
  const images = attachments.filter(isImage);
  if (images.length === 0) return { attachments, text: "" };

  const session = await openCodeApi.createSession(projectPath, visionModel);
  const described: string[] = [];
  try {
    for (const [index, image] of images.entries()) {
      const name = image.name ?? t("s_15ff0a654b", { p0: index + 1 });
      const description = await describeOne(session.id, projectPath, visionModel, image, name)
        .catch((error: unknown) => t("vision.failed", {
          error: error instanceof Error ? error.message : String(error),
          name,
        }));
      described.push(t("vision.entry", { description, name }));
    }
  } finally {
    await openCodeApi.deleteSession(session.id, projectPath).catch(() => undefined);
  }

  return {
    attachments: attachments.filter((attachment) => !isImage(attachment)),
    text: `\n\n${t("vision.header", { count: images.length })}\n${described.join("\n\n")}`,
  };
}

async function describeOne(
  sessionID: string,
  projectPath: string,
  model: ModelRef,
  image: PromptAttachment,
  name: string,
): Promise<string> {
  await openCodeApi.sendPrompt(sessionID, {
    directory: projectPath,
    files: [image],
    model,
    text: t("vision.prompt", { name }),
  });

  // The throwaway session has no tools, so this settles quickly; the ceiling only guards against
  // a provider that never finishes.
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await sleep(1000);
    const status = await openCodeApi.getSessionStatus(sessionID, projectPath);
    if (status.type !== "busy") break;
  }

  const messages = await openCodeApi.getMessages(sessionID, projectPath);
  const reply = [...messages]
    .reverse()
    .find((message): message is AssistantMessage => message.type === "assistant");
  const text = reply ? assistantText(reply) : "";
  if (!text) throw new Error(t("vision.empty"));
  return text;
}
