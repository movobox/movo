import en from "./locales/en";
import fa from "./locales/fa";

export const messages = { en, fa };
export type MessageSchema = typeof en;
export type MessageKey = keyof MessageSchema;
