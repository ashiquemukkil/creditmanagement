export type InvitationActionState = {
  message: string;
  tone: "error" | "idle" | "success" | "warning";
};

export const invitationInitialState: InvitationActionState = {
  message: "",
  tone: "idle",
};
