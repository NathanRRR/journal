import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.journalEntry.deleteMany();

  await prisma.journalEntry.createMany({
    data: [
      {
        title: 'Premier test journal',
        date: new Date(),
        tagsJson: JSON.stringify(['test', 'humeur']),
        text: 'Entree seed de test pour valider la liste, le detail et la recherche.',
      },
      {
        title: 'Entree audio seed',
        date: new Date(Date.now() - 1000 * 60 * 60 * 24),
        tagsJson: JSON.stringify(['audio', 'test']),
        text: null,
        audioUrl: '/journal-api/media/audio/sample-seed.mp3',
      },
      {
        title: 'Entree image seed',
        date: new Date(Date.now() - 1000 * 60 * 60 * 48),
        tagsJson: JSON.stringify(['image', 'test']),
        text: 'Cette entree simule une piece jointe image en seed.',
        imageUrl: '/journal-api/media/images/sample-seed.jpg',
      },
    ],
  });

  console.log('[seed-test] 3 entries inserted');
}

main()
  .catch((error) => {
    console.error('[seed-test] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
