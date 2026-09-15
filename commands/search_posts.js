const { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require('discord.js');
const { Post, Reply, Like } = require('../database');
const { Op } = require('sequelize');
const { createPostDetailEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('search_posts')
    .setDescription('投稿をキーワードで検索します')
    .addStringOption(option =>
      option.setName('keyword')
        .setDescription('検索するキーワード')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('postid')
        .setDescription('検索する投稿のID')
        .setRequired(false)),
  longDescription: '現在のサーバーの公開投稿を検索できます。\n・キーワードで投稿内容を検索、または投稿IDで直接検索可能\n・検索結果からbrowse_postsと同様にいいねやリプライを行えます。',
  async execute(interaction) {
    const keyword = interaction.options.getString('keyword');
    const postid = interaction.options.getString('postid');

    // 検索条件を動的に構築
    const whereClause = { isPrivate: false, guildId: interaction.guild.id };
    if (keyword) {
      whereClause.content = { [Op.like]: `%${keyword}%` };
    }
    if (postid && !isNaN(parseInt(postid))) {
      whereClause.id = parseInt(postid);
    }

    // 条件に合致する投稿を検索
    const posts = await Post.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      include: [Reply, Like]
    });

    if (posts.length === 0) {
      return interaction.reply({ content: 'まだ公開投稿がありません。', flags: 64 });
    }

    const embedsAndComponents = [];
    for (const post of posts) {
      const postEmbeds = createPostDetailEmbed(post, interaction.user, interaction.guild);

      const userLiked = await Like.findOne({ where: { userId: interaction.user.id, postId: post.id } });
      const likeButtonLabel = userLiked ? '❤️ いいね済み' : '❤️ いいね';
      const likeButtonStyle = userLiked ? ButtonStyle.Success : ButtonStyle.Primary;

      const actionRow1 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`like_button_${post.id}`)
            .setLabel(likeButtonLabel)
            .setStyle(likeButtonStyle)
        );

      const actionRow2 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`reply_button_${post.id}`)
            .setLabel('💬 投稿にリプライ')
            .setStyle(ButtonStyle.Secondary)
        );
      embedsAndComponents.push({ embeds: postEmbeds, components: [actionRow1, actionRow2] });
    }

    if (embedsAndComponents.length > 0) {
      await interaction.reply({
        embeds: embedsAndComponents[0].embeds,
        components: embedsAndComponents[0].components,
        flags: 64
      });
      for (let i = 1; i < embedsAndComponents.length; i++) {
        await interaction.followUp({
          embeds: embedsAndComponents[i].embeds || [],
          components: embedsAndComponents[i].components || [],
          flags: 64
        });
      }
    } else {
      await interaction.reply({ content: '該当する投稿が見つかりませんでした。', flags: 64 });
    }
  }
};