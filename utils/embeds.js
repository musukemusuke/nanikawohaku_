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
async function formatReplies(replies, guild, parentId = null, depth = 0) {
  let result = '';
  const indent = '  '.repeat(depth); // 深さに応じたインデント
  const repliesToProcess = replies.filter(r => r.parentId === parentId);

  for (const reply of repliesToProcess) {
      const user = await guild.client.users.fetch(reply.userId);
      const member = guild.members.cache.get(reply.userId);
      const displayName = member ? member.displayName : user.username;
      const date = new Date(reply.createdAt);
      const dateStr = `${date.getFullYear()}/${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getDate().toString().padStart(2,'0')} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
      result += `${indent}💬 **${displayName} (@${user.username})**: ${reply.content} (${dateStr})\n`;
      // 再帰的に子リプライを処理
      result += await formatReplies(replies, guild, reply.id, depth + 1);
    }
  return result;
}

async function createPostDetailEmbed(post, interactionUser, guild) {
  const baseEmbed = new EmbedBuilder()
    .setColor(post.isPrivate ? '#FF6B6B' : '#1DA1F2')
    .setAuthor({ name: post.username });

  // リプライを階層化して文字列化
  const formattedReplies = await formatReplies(post.Replies, guild);

  const likeUsers = await Promise.all(post.Likes.map(async like => {
    const user = await guild.client.users.fetch(like.userId);
    const member = guild.members.cache.get(like.userId);
    const displayName = member ? member.displayName : user.username;
    return `${displayName} (@${user.username})`;
  }));
  
  if (post.imageUrl) {
    const contentEmbed = new EmbedBuilder(baseEmbed)
      .setDescription(`${post.content}`)
      .setImage(post.imageUrl)
      .setTimestamp(post.createdAt);

    const embeds = [contentEmbed]; // Start with content embed

    const metadataEmbed = new EmbedBuilder()
      .setColor(baseEmbed.data.color)
      .addFields(
        { name: '投稿ID', value: `${post.id}`, inline: true },
        { name: 'ステータス', value: post.isPrivate ? '🔒 非公開' : '🌐 公開', inline: true }
      );
    embeds.push(metadataEmbed); // Add metadata embed

    // リプライがあれば追加
    if (formattedReplies.trim()) {
      const repliesEmbed = new EmbedBuilder()
        .setColor(baseEmbed.data.color)
        .addFields({ name: '💬 リプライ', value: formattedReplies.substring(0, 1024) });
      embeds.push(repliesEmbed);
    }

    // いいねがあれば追加
    if (likeUsers.length > 0) {
      const likesEmbed = new EmbedBuilder()
        .setColor(baseEmbed.data.color)
        .addFields({ name: `❤️ ${likeUsers.length}件のいいね`, value: likeUsers.join(', ') });
      embeds.push(likesEmbed);
    } else {
      const likesEmbed = new EmbedBuilder()
        .setColor(baseEmbed.data.color)
        .addFields({ name: `❤️ 0件のいいね`, value: 'まだいいねはありません' });
      embeds.push(likesEmbed);
    }

    return embeds;
  } else {
      const contentEmbed = new EmbedBuilder(baseEmbed)
        .setDescription(`${post.content}`)
        .setTimestamp(post.createdAt);

      const embeds = [contentEmbed]; // Start with content embed

      const metadataEmbed = new EmbedBuilder()
        .setColor(baseEmbed.data.color)
        .addFields(
          { name: '投稿ID', value: `${post.id}`, inline: true },
          { name: 'ステータス', value: post.isPrivate ? '🔒 非公開' : '🌐 公開', inline: true }
        );
      embeds.push(metadataEmbed); // Add metadata embed

      // リプライがあれば追加
      if (formattedReplies.trim()) {
        const repliesEmbed = new EmbedBuilder()
          .setColor(baseEmbed.data.color)
          .addFields({ name: '💬 リプライ', value: formattedReplies.substring(0, 1024) });
        embeds.push(repliesEmbed);
      }

      // いいねがあれば追加
      if (likeUsers.length > 0) {
        const likesEmbed = new EmbedBuilder()
          .setColor(baseEmbed.data.color)
          .addFields({ name: `❤️ ${likeUsers.length}件のいいね`, value: likeUsers.join(', ') });
        embeds.push(likesEmbed);
      } else {
        const likesEmbed = new EmbedBuilder()
          .setColor(baseEmbed.data.color)
          .addFields({ name: `❤️ 0件のいいね`, value: 'まだいいねはありません' });
        embeds.push(likesEmbed);
      }

      return embeds;
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

  // リプライ表示はmypostsでは行わないため削除
  // let repliesText = '';
  // if (post.Replies && post.Replies.length > 0) {
  //   repliesText = '\n\n---\n**💬 リプライ**\n' + formatReplies(post.Replies);
  //   // DiscordのEmbed文字数制限(1024文字)に対応
  //   if (repliesText.length > 900) {
  //     repliesText = repliesText.substring(0, 900) + '\n...(リプライが多いため省略)';
  //   }
  // }

  if (post.imageUrl) {
    const contentEmbed = new EmbedBuilder(baseEmbed)
      .setDescription(`**投稿ID:** ${post.id}\n\n${post.content}`)
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
      .setDescription(`**投稿ID:** ${post.id}\n\n${post.content}`)
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