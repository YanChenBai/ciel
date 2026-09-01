export interface ConversationItem {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly metadata: string;
  readonly text: string;
  readonly time?: number;
}
