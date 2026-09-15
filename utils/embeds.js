const { EmbedBuilder } = require('discord.js');

function createPostPreviewEmbed(username, content, imageUrl) {
  const embed = new EmbedBuilder()
    .setColor('#00FF00') // 緑色
    // .setTitle('投稿プレビュー')
    .setAuthor({ name: username })
    .setDescription(content)
    .setTimestamp(); // 引数なし

  if (imageUrl) {
    embed.addFields({ name: '添付メディア', value: imageUrl, inline: false });
  }

  return embed;
}

// リプライを階層的にフォーマットするヘルパー関数
function formatReplies(replies, parentId = null, depth = 0) {
  let result = '';
  const indent = '  '.repeat(depth); // 深さに応じたインデント
  const repliesToProcess = replies.filter(r => r.parentId === parentId);

  for (const reply of repliesToProcess) {
    const date = new Date(reply.createdAt);
    const dateStr = `${date.getFullYear()}/${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getDate().toString().padStart(2,'0')} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
    result += `${indent}💬 **${reply.username}**: ${reply.content} (${dateStr})\n`;
    // 再帰的に子リプライを処理
    result += formatReplies(replies, reply.id, depth + 1);
  }
  return result;
}

function createPostDetailEmbed(post, likeUsers = [], replies = []) {
  const baseEmbed = new EmbedBuilder()
    .setColor(post.isPrivate ? '#FF6B6B' : '#1DA1F2')
    .setAuthor({ name: post.username });

  // リプライを階層化して文字列化
  const formattedReplies = formatReplies(replies);
  
  if (post.imageUrl) {
    const contentEmbed = new EmbedBuilder(baseEmbed)
      .setDescription(`${post.content}`)
      .setImage(post.imageUrl)
      .setTimestamp(post.createdAt);

    const metadataEmbed = new EmbedBuilder()
      .setColor(baseEmbed.data.color)
      .addFields(
        { name: '投稿ID', value: `${post.id}`, inline: true },
        { name: 'ステータス', value: post.isPrivate ? '🔒 非公開' : '🌐 公開', inline: true },
        { name: 'いいね', value: `${post.likes}`, inline: true }
      );

    // リプライがあれば追加
    if (formattedReplies.trim()) {
      metadataEmbed.addFields({ name: '💬 リプライ', value: formattedReplies.substring(0, 1024) }); // Discordの文字数制限対策
    }

    if (likeUsers.length > 0) {
      metadataEmbed.addFields({ name: 'いいねしたユーザー', value: likeUsers.join(', ') || 'なし' });
    }

    return [contentEmbed, metadataEmbed];
  } else {
    const singleEmbed = new EmbedBuilder(baseEmbed)
      .setDescription(`${post.content}`)
      .addFields(
        { name: '投稿ID', value: `${post.id}`, inline: true },
        { name: 'ステータス', value: post.isPrivate ? '🔒 非公開' : '🌐 公開', inline: true },
        { name: 'いいね', value: `${post.likes}`, inline: true }
      )
      .setTimestamp(post.createdAt);

    // リプライがあれば追加
    if (formattedReplies.trim()) {
      singleEmbed.addFields({ name: '💬 リプライ', value: formattedReplies.substring(0, 1024) });
    }

    if (likeUsers.length > 0) {
      singleEmbed.addFields({ name: 'いいねしたユーザー', value: likeUsers.join(', ') || 'なし' });
    }

    return [singleEmbed];
  }
}

function createPostListEmbed(posts, isPrivateView = false) {
  const embed = new EmbedBuilder()
    .setColor('#1DA1F2')
    .setTitle('投稿一覧')
    .setTimestamp(new Date()); // リスト生成時刻を表示
  
  let description = '';
  posts.forEach(post => {
    if (!post) return; // 投稿が存在しない場合はスキップ
    const statusIcon = post.isPrivate ? '🔒' : '🌐';
    const imageIcon = post.imageUrl ? '🖼️ ' : ''; // 画像がある場合にアイコンを追加
    const content = isPrivateView || !post.isPrivate ? post.content.substring(0, 150) : '██████████████████████████'; // 表示文字数を150に増やす
    
    // 投稿日時をフォーマット
    const postDate = new Date(post.createdAt);
    const now = new Date();
    const isToday = postDate.toDateString() === now.toDateString();
    const timeString = isToday 
      ? `今日 ${postDate.getHours().toString().padStart(2, '0')}:${postDate.getMinutes().toString().padStart(2, '0')}`
      : `${postDate.getFullYear()}/${(postDate.getMonth() + 1).toString().padStart(2, '0')}/${postDate.getDate().toString().padStart(2, '0')} ${postDate.getHours().toString().padStart(2, '0')}:${postDate.getMinutes().toString().padStart(2, '0')}`;

    // リプライ数を取得 (post.Replies が配列として含まれていることを想定)
    const replyCount = post.Replies ? post.Replies.length : 0;

    description += `**投稿ID:** ${post.id}\n`;
    description += `${statusIcon} ${imageIcon}${post.username}: ${content}${post.content.length > 150 ? '...' : ''}\n`;
    description += `❤️${post.Likes ? post.Likes.length : 0} 💬${replyCount} | ${timeString}\n\n`;
  });
  
  if (description === '') {
    description = '投稿がありません';
  }
  
  embed.setDescription(description);
  return embed;
}

module.exports = {
  createPostPreviewEmbed,
  createPostDetailEmbed,
  createPostListEmbed,
  createMyPostDetailEmbed,
  createMyReplyEmbed
};

function createMyPostDetailEmbed(post) {
  const baseEmbed = new EmbedBuilder()
    .setColor(post.isPrivate ? '#FF6B6B' : '#1DA1F2')
    .setAuthor({ name: post.username });

  // リプライを階層的にフォーマット
  let repliesText = '';
  if (post.Replies && post.Replies.length > 0) {
    repliesText = '\n\n---\n**💬 リプライ一覧**\n' + formatReplies(post.Replies);
    // DiscordのEmbed文字数制限(1024文字)に対応
    if (repliesText.length > 900) {
      repliesText = repliesText.substring(0, 900) + '\n...(リプライが多いため省略)';
    }
  }

  if (post.imageUrl) {
    const contentEmbed = new EmbedBuilder(baseEmbed)
      .setDescription(`**投稿ID:** ${post.id}\n\n${post.content}${repliesText}`)
      .setImage(post.imageUrl)
      .setTimestamp(post.createdAt);

    const metadataEmbed = new EmbedBuilder()
      .setColor(baseEmbed.data.color)
      .addFields(
        { name: 'ステータス', value: post.isPrivate ? '🔒 非公開' : '🌐 公開', inline: true }
      );

    return [contentEmbed, metadataEmbed];

  } else {
    const singleEmbed = new EmbedBuilder(baseEmbed)
      .setDescription(`**投稿ID:** ${post.id}\n\n${post.content}${repliesText}`)
      .addFields(
        { name: 'ステータス', value: post.isPrivate ? '🔒 非公開' : '🌐 公開', inline: true }
      )
      .setTimestamp(post.createdAt);

    return [singleEmbed];
  }
}

function createMyReplyEmbed(reply) {
  const post = reply.Post; // Original post
  if (!post) {
    return null; // Should not happen if include: Post is used, but for safety
  }

  const statusIcon = post.isPrivate ? '🔒' : '🌐';
  const imageIcon = post.imageUrl ? '🖼️ ' : '';
  const originalPostContentSnippet = post.content.substring(0, 80) + (post.content.length > 80 ? '...' : '');

  const replyDate = new Date(reply.createdAt);
  const now = new Date();
  const isToday = replyDate.toDateString() === now.toDateString();
  const replyTimeString = isToday
    ? `今日 ${replyDate.getHours().toString().padStart(2, '0')}:${replyDate.getMinutes().toString().padStart(2, '0')}`
    : `${replyDate.getFullYear()}/${(replyDate.getMonth() + 1).toString().padStart(2, '0')}/${replyDate.getDate().toString().padStart(2, '0')} ${replyDate.getHours().toString().padStart(2, '0')}:${replyDate.getMinutes().toString().padStart(2, '0')}`;

  const embed = new EmbedBuilder()
    .setColor('#1DA1F2')
    .setTitle('あなたのリプライ')
    .setAuthor({ name: reply.username })
    .setDescription(
      `**リプライID:** ${reply.id}\n` +
      `**リプライ内容:** ${reply.content}\n\n` +
      `**元の投稿:**\n` +
      `${statusIcon} ${imageIcon}ID: ${post.id} | ${originalPostContentSnippet}\n`
    )
    .setFooter({ text: `リプライ日時: ${replyTimeString}` })
    .setTimestamp(reply.createdAt);

  return embed;
}