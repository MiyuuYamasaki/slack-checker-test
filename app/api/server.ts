import { View, WebClient } from '@slack/web-api';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Slackのトークンを環境変数から取得
const botToken = process.env.BOT_TOKEN;
const botClient = new WebClient(botToken);

// 当日日付を取得
const ymd = await getFormattedDate();

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

      // 確認用
      // console.log('parsedBody:', JSON.stringify(parsedBody, null, 2));

      if (actions && actions.length > 0) {
        const messageText = message.text;
        const match = messageText.match(/\d{4}\/\d{2}\/\d{2}/);

        // 当日分のみ処理
        if (ymd === match[0]) {
          let selectedAction = actions[0].value;
          console.log('▼ Start action : ' + selectedAction);

          if (selectedAction != '一覧') {
            const tasks = [];

            tasks.push(
              (async () => {
                // ユーザー名を取得
                const userName = await getUserName(botClient, user.id);

                // メッセージを投稿
                await botClient.chat.postMessage({
                  channel: channel.id,
                  thread_ts: message.ts,
                  text: `${userName}さんが${selectedAction}を選択しました！`,
                });
              })()
            );

            tasks.push(
              (async () => {
                // Recordを更新
                await upsertRecord(user.id, channel.id, selectedAction);

                let officeCount = 0;
                let remoteCount = 0;
                let leaveCount = 0;
                let outCount = 0;

                await getStatusCounts(channel.id).then(
                  (data: { status: string; count: bigint }[]) => {
                    data.forEach((row) => {
                      if (row.status === '本社') {
                        officeCount = Number(row.count); // BigInt を通常の数値に変換
                      } else if (row.status === '在宅') {
                        remoteCount = Number(row.count); // BigInt を通常の数値に変換
                      } else if (row.status === '退勤') {
                        leaveCount = Number(row.count);
                      } else if (row.status === '出先') {
                        outCount = Number(row.count);
                      }
                    });
                  }
                );

                await updateMessage(
                  channel.id,
                  message.ts,
                  messageText,
                  officeCount,
                  remoteCount,
                  outCount,
                  leaveCount
                );
              })()
            );

            try {
              await Promise.all(tasks);
              console.log('Complete all tasks');
            } catch (e) {
              console.log('ERROR:' + e);
              res.status(500).send('Status updated');
            }
          } else if (selectedAction === '一覧') {
            try {
              // チャンネルメンバーを取得
              const membersResponse = await botClient.conversations.members({
                channel: channel.id,
              });
              const members = membersResponse.members || [];

              // 除外対象のユーザーID一覧
              const excludedUserIds = [
                'U084L4J7MH6', // 出勤チェッカー（旧）
                'U087M8J5EBX', // 出勤チェッカー（新）
                'U086NCU8PUY', // TEST BOT
                'U086QP71G7K', // SUNSUNくん
                'U08AS8773NE', // TaskBot
              ];

              // 除外ユーザーを除いたリストを作成
              const filteredMembers = members.filter(
                (member) => !excludedUserIds.includes(member)
              );

              console.log(
                `Member acquisition successful : ${filteredMembers.length} 名`
              );

              // 一覧を表示
              await botClient.views.open({
                trigger_id: trigger_id,
                view: await createModal(filteredMembers, channel.id, prisma),
              });
            } catch (err) {
              console.log('ERROR:' + err);
            }
          }
          console.log('▲ End action : ' + selectedAction);
        } else {
          // 操作不可のメッセージ表示
          try {
            await openModal(trigger_id);
            console.log('Date unmatch');
          } catch (err) {
            console.log('ERROR:' + err);
          }
        }
        res.status(200).send('All Complete');
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

  // 年、月、日を取得
  const year = ymd.getFullYear();
  const month = String(ymd.getMonth() + 1).padStart(2, '0'); // 月は0から始まるため +1
  const day = String(ymd.getDate()).padStart(2, '0'); // 日付を2桁に

  return `${year}/${month}/${day}`;
}

// DB操作
async function upsertRecord(
  userId: string,
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
      // レコードが存在し、statusが異なる場合更新
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
  // State テーブルからチャンネルの該当レコードを一括取得
  const existingRecords = await prisma.state.findMany({
    where: {
      channel: channel,
      ymd: ymd,
    },
  });

  // メンバーを分類
  const statusMap: { [key: string]: string[] } = {};

  // 全メンバーを一旦「休暇」に分類
  statusMap['休暇'] = [...members]; // 全てのメンバーを一旦「休暇」に入れる

  // existingRecords に基づいて分類を更新
  for (const record of existingRecords) {
    const index = statusMap['休暇'].indexOf(record.user); // 休暇リスト内でユーザーを探す
    if (index !== -1) {
      statusMap['休暇'].splice(index, 1); // 休暇から削除
    }

    if (!statusMap[record.status]) {
      statusMap[record.status] = [];
    }
    statusMap[record.status].push(record.user); // 該当ステータスに追加
  }

  // ステータスの順番を固定
  const statusOrder = ['本社', '在宅', '出先', '退勤', '休暇'];

  // ステータスごとのテキストを作成
  const statusSections = statusOrder.map((status) => {
    const memberCount = statusMap[status]?.length || 0;
    const statusLabel =
      status === '本社'
        ? '🏢 本社勤務'
        : status === '在宅'
        ? '🏡 在宅勤務'
        : status === '出先'
        ? '🚗 出向先勤務／お客様先へ直出'
        : status === '退勤'
        ? '👋 退勤済'
        : ':zzz: 休暇(回答無)';

    return {
      type: 'section',
      text: {
        type: 'mrkdwn' as const,
        text: `*${statusLabel} (${memberCount}名):*\n${
          statusMap[status]?.map((member) => `<@${member}>`).join('\n') ||
          'なし'
        }`,
      },
    };
  });

  // モーダルデータ
  return {
    type: 'modal' as const,
    title: {
      type: 'plain_text' as const,
      text: `${ymd} 勤務状況一覧`,
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
  messageText: string,
  officeCount: number,
  remoteCount: number,
  outCount: number,
  leaveCount: number
) {
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
            text: `🏢 本社 (${officeCount})`,
            emoji: true,
          },
          action_id: 'button_office',
          value: '本社',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: `🏡 在宅 (${remoteCount})`,
            emoji: true,
          },
          action_id: 'button_remote',
          value: '在宅',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: `🚗 出先 (${outCount})`,
            emoji: true,
          },
          action_id: 'button_out',
          value: '出先',
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
            text: `👋 退勤 (${leaveCount})`,
            emoji: true,
          },
          action_id: 'button_goHome',
          style: 'danger',
          value: '退勤',
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

// カウント用クエリ
async function getStatusCounts(channelId) {
  return await prisma.$queryRaw`
    SELECT status, COUNT(*) as count
    FROM state
    WHERE channel = ${channelId}
      AND ymd = ${ymd}
    GROUP BY status
  `;
}

// 画面日付と当日日付がアンマッチの場合
async function openModal(trigger_id: string) {
  const modalView: View = {
    type: 'modal',
    title: {
      type: 'plain_text',
      text: 'エラー 😢',
      emoji: true,
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '当日データ以外の参照・変更はできません。',
        },
      },
    ],
  };

  // モーダルウィンドウを開く
  await botClient.views.open({
    trigger_id: trigger_id,
    view: modalView,
  });
}
