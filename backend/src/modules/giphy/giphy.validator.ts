import * as yup from "yup";

export const importGiphyAssetSchema = yup.object({
  kind: yup.string().oneOf(["gifs", "stickers"]).required(),
  giphyId: yup.string().required(),
  originalUrl: yup.string().url().required(),
});
