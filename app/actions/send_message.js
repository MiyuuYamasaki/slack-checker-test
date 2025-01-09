import { WebClient } from '@slack/web-api';

const SLACK_TOKEN = process.env.SLACK_TOKEN;
// const CHANNEL_ID = 'C083QUBKU9L';
const CHANNEL_ID = 'C07HLMDLB1U';

// 日付のフォーマットを変更
function getFormattedDate() {
  const now = new Date();

  // 日本時間に合わせる（UTC + 9 時間）
  now.setHours(now.getHours() + 9);

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0'); // 月は0から始まるので+1
  const day = String(now.getDate()).padStart(2, '0');

  // 曜日を取得（日本語）
  const daysOfWeek = ['月', '火', '水', '木', '金'];
  const dayOfWeek = daysOfWeek[now.getDay()];

  return `${year}/${month}/${day}(${dayOfWeek})`; // 例: 2024/12/05(木)
}

// Slack Web APIクライアントを初期化
const client = new WebClient(SLACK_TOKEN);

async function sendSlackMessage(channelId) {
  try {
    const formattedDate = getFormattedDate();
    const result = await client.chat.postMessage({
      channel: channelId,
      text: `業務連絡スレッド ${formattedDate}`, // 必須フィールド
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `業務連絡スレッド ${formattedDate}`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '🏢 本社',
                emoji: true,
              },
              action_id: 'button_office',
              value: '本社',
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '🏡 在宅',
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
                text: `👋 退勤`,
                emoji: true,
              },
              action_id: 'button_goHome',
              style: 'danger',
              value: '退勤',
            },
          ],
        },
      ],
    });
    console.log('Message sent: ', result.ts);
  } catch (error) {
    console.error('Error sending message: ', error);
  }
}

sendSlackMessage(CHANNEL_ID);
