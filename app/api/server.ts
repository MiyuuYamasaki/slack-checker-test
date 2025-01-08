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
      // console.log(actions);

      // console.log(message.text);

      // console.log('parsedBody:', JSON.stringify(parsedBody, null, 2));

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

          const ymd = await getFormattedDate();

          // Recordを更新
          await upsertRecord(user.name, ymd, channel.id, selectedAction);

          let officeCount = 0;
          let remoteCount = 0;

          console.log('start getStatusCounts');
          await getStatusCounts(channel.id, ymd).then(
            (data: { status: string; count: bigint }[]) => {
              console.log('data:');
              console.log(data); // デバッグ用：取得したデータを確認
              let count = 0;

              data.forEach((row) => {
                count++;
                console.log(`row ${count}:`, row);
                console.log('data (JSON):', JSON.stringify(row, null, 2));

                if (row.status === '本社') {
                  officeCount = Number(row.count); // BigInt を通常の数値に変換
                } else if (row.status === '在宅') {
                  remoteCount = Number(row.count); // BigInt を通常の数値に変換
                }
              });
            }
          );

          // main();

          // DBから最新の人数を取得
          // await getStatusCounts(channel.id, ymd)
          //   .then((data) => {
          //     console.log(data);
          //     data.forEach((row) => {
          //       if (row.status === '本社') {
          //         officeCount = row.count || 0;
          //       } else if (row.status === '在宅') {
          //         remoteCount = row.count || 0;
          //       } else if (row.status === '退勤済') {
          //         leaveCount += row.count || 0;
          //       }
          //     });
          //   })
          //   .catch((error) => {
          //     console.error(error);
          //   });

          // type option = {
          //   [key: string]: number;
          // };
          // const options: option = {
          //   officeCount: 0,
          //   remoteCount: 0,
          //   leaveCount: 0,
          // };

          await updateMessage(channel.id, message.ts, message.text);
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
    const existingRecord = await prisma.state.findFirst({
      where: {
        user: userId,
        ymd: ymd,
        channel: channelId,
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
    } else if (existingRecord.status !== selectedStatus) {
      // レコードが存在し、selected_statusが異なる場合、更新
      await prisma.state.update({
        where: { id: existingRecord.id },
        data: {
          status: selectedStatus,
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
  // const record = await prisma.status.findFirst({
  //   where: {
  //     ymd: ymd,
  //     channel_id: channel,
  //   },
  // });

  console.log('ymd:' + ymd);

  for (const member of members) {
    const existingRecord = await prisma.state.findFirst({
      where: {
        ymd: ymd,
        channel: channel,
        user: member,
      },
    });
    console.log('ymd:' + ymd + ' channel_id:' + channel + ' user_id:' + member);

    const status = existingRecord?.status || '休暇'; // ステータスが無い場合は "休暇"
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

// メッセージ更新
async function updateMessage(
  channel: string,
  ts: string,
  messageText: string
  // options: string[number]
) {
  // const { officeCount, remoteCount, leaveCount } = options;

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: messageText,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '🏢 本社 ()',
            emoji: true,
          },
          action_id: 'button_office',
          value: '本社',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '🏡 在宅 ()',
            emoji: true,
          },
          action_id: 'button_remote',
          value: '在宅',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: `📋 一覧`,
            emoji: true,
          },
          action_id: 'button_list',
          value: '一覧',
          style: 'primary',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: `👋 退勤 ()`,
            emoji: true,
          },
          action_id: 'button_goHome',
          style: 'danger',
          value: '退勤済',
        },
      ],
    },
  ];

  try {
    const response = await botClient.chat.update({
      channel,
      ts,
      text: messageText,
      blocks,
    });
    return response;
  } catch (error) {
    console.error('Error updating message with buttons:', error);
    throw error;
  }
}

async function getStatusCounts(channelId, ymd) {
  return await prisma.$queryRaw`
    SELECT status, COUNT(*) as count
    FROM state
    WHERE channel = ${channelId}
      AND ymd = ${ymd}
    GROUP BY status
  `;
}

async function main() {
  const channel = { id: 'example_channel_id' };
  const ymd = '2025-01-08'; // 任意の日付

  const initialCounts = { officeCount: 0, remoteCount: 0, leaveCount: 0 };

  const counts = await getStatusCounts(channel.id, ymd).then((data) => {
    console.log(data); // デバッグ用：取得したデータを確認
  });
  await prisma.$disconnect();
}
