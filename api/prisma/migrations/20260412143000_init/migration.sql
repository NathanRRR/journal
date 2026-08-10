-- Create journal entries table (SQLite)
CREATE TABLE "JournalEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "date" DATETIME NOT NULL,
  "tagsJson" TEXT NOT NULL DEFAULT '[]',
  "text" TEXT,
  "audioUrl" TEXT,
  "imageUrl" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "JournalEntry_date_idx" ON "JournalEntry"("date");
