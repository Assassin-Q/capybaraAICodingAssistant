/**
 * Text the client adds to a prompt for the model's benefit, which the user never typed.
 *
 * Two things get appended today: a vision model's description of images the conversation model
 * cannot read, and a note listing attachments that were dropped for the same reason. Both belong
 * in the request and neither belongs in the user's bubble — it showed a wall of transcription
 * instead of the sentence the user actually wrote.
 *
 * A per-message map of original texts would only fix the live case; reopening the session reads
 * the augmented text back from the server. Marking the inserted block instead means it can be
 * stripped whenever it is rendered, however the message was loaded. The markers are HTML comments
 * so that a renderer which somehow sees one drops it rather than printing it, and they are fixed
 * ASCII rather than translated text, so a message written in one locale still strips in another.
 */
const OPEN = "<!--capybara:context-->";
const CLOSE = "<!--/capybara:context-->";

export const wrapPromptAugmentation = (body: string): string => `${OPEN}\n${body}\n${CLOSE}`;

const AUGMENTATION = new RegExp(`${OPEN}[\\s\\S]*?${CLOSE}`, "g");

/** Removes every marked block, leaving what the user typed. */
export const stripPromptAugmentations = (text: string): string =>
  text.includes(OPEN) ? text.replace(AUGMENTATION, "").replace(/\n{3,}/g, "\n\n").trim() : text;
