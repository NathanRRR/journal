export type JournalEntry = {
  id: string;
  title: string;
  date: string;
  tags: string[];
  text?: string;
  audioUrl?: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
};
