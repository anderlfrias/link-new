/** Nombres de eventos de Socket.IO, ver backend/API.md secciones 3, 5, 6.5 y 8. */
export const SOCKET_EVENTS = {
  conversation: {
    join: "conversation:join",
    leave: "conversation:leave",
    created: "conversation:created",
    updated: "conversation:updated",
    memberAdded: "conversation:member_added",
    memberRemoved: "conversation:member_removed",
    memberAdminChanged: "conversation:member_admin_changed",
    memberPreferenceChanged: "conversation:member_preference_changed",
    deleted: "conversation:deleted",
    receiptUpdated: "conversation:receipt_updated",
  },
  message: {
    created: "message:created",
    updated: "message:updated",
    deleted: "message:deleted",
    reactionUpdated: "message:reaction_updated",
    pollVoted: "message:poll_voted",
    typingStart: "message:typing_start",
    typingStop: "message:typing_stop",
  },
} as const;
