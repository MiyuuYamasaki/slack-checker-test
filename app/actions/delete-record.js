import { createClient } from '@supabase/supabase-js';

export default async (req, res) => {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  if (req.method === 'POST') {
    try {
      const { error } = await supabase.from('state').delete();

      if (error) {
        return res
          .status(500)
          .json({ message: 'Failed to delete records', error });
      }
      return res.status(200).json({ message: 'Records deleted successfully' });
    } catch (err) {
      return res
        .status(500)
        .json({ message: 'Internal server error', error: err });
    }
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
};
