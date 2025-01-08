import { WebClient } from '@slack/web-api';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Slackのトークンを環境変数から取得

const botToken = process.env.BOT_TOKEN;
const botClient = new WebClient(botToken);

export const config = {
  api: {
    bodyParser: true, // デフォルトの body parser を使う
  },
};

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const parsedBody = JSON.parse(req.body.payload);
      const { actions, user, channel, message, trigger_id } = parsedBody;
      console.log(actions);

      console.log('parsedBody:', JSON.stringify(parsedBody, null, 2));

      if (actions && actions.length > 0) {
        let selectedAction = actions[0].value;
        console.log('selectedAction:' + selectedAction);

        if (
          selectedAction === '本社' ||
          selectedAction === '在宅' ||
          selectedAction === '退勤済'
        ) {
          const userName = await getUserName(botClient, user.id);

          await botClient.chat.postMessage({
            channel: channel.id,
            thread_ts: message.ts,
            text: `${userName}さんが${selectedAction}を選択しました！`,
          });

          // Recordを更新
          await upsertRecord(
            user.name,
            await getFormattedDate(),
            channel.id,
            selectedAction
          );
        } else if (selectedAction === '一覧') {
          // 一覧を表示
          // チャンネルメンバーを取得
          const membersResponse = await botClient.conversations.members({
            channel: channel.id,
          });
          const members = membersResponse.members || [];

          // メンバー情報を取得してBotを除外
          const filteredMembers: string[] = [];
          for (const memberId of members) {
            const userInfo = await botClient.users.info({ user: memberId });
            if (!userInfo.user?.is_bot && userInfo.user?.id !== 'USLACKBOT') {
              filteredMembers.push(userInfo.user?.name || 'ERROR');
            }
          }

          console.log('▼ start createModal');
          console.log(filteredMembers);
          // モーダルを表示
          await botClient.views.open({
            trigger_id: trigger_id,
            view: await createModal(filteredMembers, channel.id, prisma),
          });
        }

        res.status(200).send('Status updated');
      }
    } catch (error) {
      console.error('Error processing Slack interaction:', error);
      res.status(500).json({
        message: 'Internal Server Error' + error,
      });
    }
  } else {
    res.status(405).send('Method Not Allowed');
  }
}

// ユーザの表示名を取得する関数
export async function getUserName(
  userClient: WebClient,
  userId: string
): Promise<string> {
  try {
    const result = await userClient.users.info({ user: userId });

    if (result.user) {
      const profile = result.user.profile as {
        real_name?: string;
        display_name?: string;
      };

      return profile.display_name || profile.real_name || 'Unknown User';
    }

    return 'Unknown User';
  } catch (error) {
    console.error('Error fetching user name:', error);
    throw new Error('Failed to fetch user name');
  }
}

// 当日日付を取得
async function getFormattedDate() {
  const ymd = new Date();
  // 日本時間に合わせる（UTC + 9 時間）
  ymd.setHours(ymd.getHours() + 9);

  return ymd.toISOString().split('T')[0].toString() || '';
}

// record操作
async function upsertRecord(
  userId: string,
  ymd: string,
  channelId: string,
  selectedStatus: string
) {
  try {
    // 既存のレコードがあるか確認
    const existingRecord = await prisma.record.findFirst({
      where: {
        user_id: userId,
        ymd: ymd,
        channel_id: channelId,
      },
    });

    console.log('existingRecord:', JSON.stringify(existingRecord, null, 2));

    if (!existingRecord) {
      // レコードが存在しない場合、作成
      await prisma.state.create({
        data: {
          user: userId,
          ymd: ymd,
          status: selectedStatus,
          channel: channelId,
        },
      });
    } else if (existingRecord.selected_status !== selectedStatus) {
      // レコードが存在し、selected_statusが異なる場合、更新
      await prisma.record.update({
        where: { id: existingRecord.id },
        data: {
          selected_status: selectedStatus,
        },
      });
    }
  } catch (error) {
    console.error('Error processing record:', error);
  }
}

// モーダルを作成する関数
const createModal = async (members: string[], channel: string, prisma: any) => {
  // メンバーを分類するためのマップを用意
  const statusMap: { [key: string]: string[] } = {};

  const ymd = await getFormattedDate();
  const record = await prisma.record.findFirst({
    where: {
      ymd: ymd,
      channel_id: channel,
    },
  });

  console.log(record);

  for (const member of members) {
    const existingRecord = await prisma.record.findFirst({
      where: {
        ymd: ymd,
        channel_id: channel,
        user_id: member,
      },
    });
    console.log('ymd:' + ymd + ' channel_id:' + channel + ' user_id:' + member);
    console.log(existingRecord);

    const status = existingRecord?.selected_status || '休暇'; // ステータスが無い場合は "休暇"
    if (!statusMap[status]) {
      statusMap[status] = [];
    }
    statusMap[status].push(member);

    console.log('status:' + status);
  }

  // 各ステータスのリストをモーダルのテキストとして生成
  const statusSections = Object.keys(statusMap).map((status) => ({
    type: 'section',
    text: {
      type: 'mrkdwn' as const,
      text: `*${status}*\n${
        statusMap[status].map((member) => `<@${member}>`).join('\n') || 'なし'
      }`,
    },
  }));

  // モーダルデータ
  return {
    type: 'modal' as const,
    title: {
      type: 'plain_text' as const,
      text: 'チャンネルメンバー 一覧',
    },
    close: {
      type: 'plain_text' as const,
      text: '閉じる',
    },
    blocks: statusSections,
  };
};
