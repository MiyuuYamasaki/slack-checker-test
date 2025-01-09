import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async (req, res) => {
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
  console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY);

  if (req.method === 'POST') {
    // Prismaを使って 'state' テーブルから全てのレコードを削除
    (async () => {
      try {
        console.log('Connecting to database...');
        await prisma.$connect();
        console.log('Connected to database.');

        console.log('Deleting records...');
        const deleteResult = await prisma.state.deleteMany({
          where: {
            user: {
              not: null,
            },
          },
        });

        console.log(`Deleted ${deleteResult.count} records.`);

        if (deleteResult.count === 0) {
          console.log('No records found to delete.');
          return res.status(404).json({ message: 'No records to delete' });
        }

        return res
          .status(200)
          .json({ message: 'Records deleted successfully' });
      } catch (error) {
        return res
          .status(500)
          .json({ message: 'Internal server error', error: err });
      } finally {
        await prisma.$disconnect();
        console.log('Database connection closed.');
      }
    })();
  } else {
    return res
      .setHeader('Allow', 'POST')
      .status(405)
      .json({ message: 'Method not allowed' });
  }
};
