export interface DataChannelMessage {
  userName: string;
  message: string;
  createdAt: string;
}

export enum CallStateEnum {
  "WAITING" = "WAITING",
  "MAKE CALL" = "MAKE CALL",
  "INCOMING CALL" = "INCOMING CALL",
  "ON THE PHONE" = "ON THE PHONE",
}

export enum ShareOptionEnum {
  "AUDIO_ONLY" = "AUDIO_ONLY",
  "WITH_DISPLAY" = "WITH_DISPLAY",
  "WITH_CAMERA" = "WITH_CAMERA",
}
