import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async (req, res) => {
  if (req.method === 'POST') {
    console.log('start deleat');
    try {
      // Prismaを使って 'state' テーブルから全てのレコードを削除
      const deleteResult = await prisma.state.deleteMany();

      if (deleteResult.count === 0) {
        return res.status(404).json({ message: 'No records to delete' });
      }

      console.log(deleteResult);
      return res.status(200).json({ message: 'Records deleted successfully' });
    } catch (err) {
      console.error('Error deleting records:', err);
      return res
        .status(500)
        .json({ message: 'Internal server error', error: err });
    }
  } else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
};
