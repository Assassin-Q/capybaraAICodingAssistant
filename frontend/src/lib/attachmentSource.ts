export interface AttachmentSource {
  path: string;
  lineRange?: { start: number; end: number };
}

/*
 * Where a context attachment came from, carried as media-type parameters.
 *
 * The chip under a user bubble is rebuilt from what the server stored — `{mime, name, uri}` and
 * nothing else — so an extra field would not survive reopening the conversation. Media types take
 * parameters, and the mime string round-trips verbatim, which makes it the one place the origin
 * can ride along. Everything that compares a media type uses [baseMediaType] so the parameters
 * never change how an attachment is classified.
 */
const PATH_PARAM = "capybara-path";
const LINES_PARAM = "capybara-lines";

export const withAttachmentSource = (mime: string, source?: AttachmentSource): string => {
  const path = source?.path?.trim();
  if (!path) return mime;
  const range = source?.lineRange;
  const lines = range ? `;${LINES_PARAM}=${range.start}-${range.end}` : "";
  return `${mime};${PATH_PARAM}=${encodeURIComponent(path)}${lines}`;
};

/** The media type without parameters, which is what every comparison should use. */
export const baseMediaType = (mime?: string): string => (mime ?? "").split(";")[0].trim();

export const attachmentSource = (mime?: string): AttachmentSource | undefined => {
  if (!mime?.includes(`${PATH_PARAM}=`)) return undefined;
  const parameters = new Map(
    mime.split(";").slice(1)
      .map((part) => part.trim())
      .map((part) => {
        const equals = part.indexOf("=");
        return equals < 0 ? ["", ""] : [part.slice(0, equals), part.slice(equals + 1)];
      })
  );
  const path = parameters.get(PATH_PARAM);
  if (!path) return undefined;
  const bounds = /^(\d+)-(\d+)$/.exec(parameters.get(LINES_PARAM) ?? "");
  return {
    lineRange: bounds ? { end: Number(bounds[2]), start: Number(bounds[1]) } : undefined,
    path: decodeURIComponent(path),
  };
};
