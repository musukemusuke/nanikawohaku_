const { Sequelize, Model, DataTypes } = require('sequelize');
const { customAlphabet } = require('nanoid');

// アンダースコアを含まない文字セットでnanoidをカスタマイズ（customIdの区切り文字と衝突しないように）
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-';
const nanoid = customAlphabet(alphabet, 10);

// Nano IDの長さを定義
const NANOID_LENGTH = 10;
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './data/database.sqlite',
  logging: false
});

class Post extends Model {}
Post.init({
  id: {
    type: DataTypes.STRING(NANOID_LENGTH),
    defaultValue: () => nanoid(NANOID_LENGTH),
    primaryKey: true
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false
  },
  displayName: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: ''
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  imageUrl: {
    type: DataTypes.STRING
  },
  isPrivate: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  likes: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  messageId: {
    type: DataTypes.STRING,
    unique: true
  },
  allowedUserIds: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  guildId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  parentId: {
    type: DataTypes.STRING(NANOID_LENGTH),
    allowNull: true,
    references: {
      model: 'Posts',
      key: 'id',
    },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  }
}, {
  sequelize,
  modelName: 'Post'
});

class Like extends Model {}
Like.init({
  id: {
    type: DataTypes.STRING(NANOID_LENGTH),
    defaultValue: () => nanoid(NANOID_LENGTH),
    primaryKey: true
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false
  },
  displayName: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: ''
  },
  postId: {
    type: DataTypes.STRING(NANOID_LENGTH),
    allowNull: false,
    references: {
      model: Post,
      key: 'id'
    }
  }
}, {
  sequelize,
  modelName: 'Like',
  indexes: [
    {
      unique: true,
      fields: ['userId', 'postId']
    }
  ]
});

class Reply extends Model {}
Reply.init({
  id: {
    type: DataTypes.STRING(NANOID_LENGTH),
    defaultValue: () => nanoid(NANOID_LENGTH),
    primaryKey: true
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false
  },
  displayName: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: ''
  },
  postId: {
    type: DataTypes.STRING(NANOID_LENGTH),
    allowNull: false,
    references: {
      model: Post,
      key: 'id'
    }
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  guildId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  parentId: {
    type: DataTypes.STRING(NANOID_LENGTH),
    allowNull: true,
    references: {
      model: 'Replies',
      key: 'id',
    },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  }
}, {
  sequelize,
  modelName: 'Reply'
});

Post.hasMany(Like, { foreignKey: 'postId', onDelete: 'CASCADE' });
Like.belongsTo(Post, { foreignKey: 'postId' });

Post.hasMany(Reply, { foreignKey: 'postId', onDelete: 'CASCADE' });
Reply.belongsTo(Post, { foreignKey: 'postId' });

async function initDatabase() {
  try {
    // 外部キー制約を一時的に無効化してからテーブルを再作成
    await sequelize.query('PRAGMA foreign_keys = OFF;');
    // モデルの変更をデータベースに同期（force: trueでテーブルを再作成）
    await sequelize.sync({ force: true });
    // 外部キー制約を再度有効化
    await sequelize.query('PRAGMA foreign_keys = ON;');
    
    // 既存のレコードでdisplayNameが空のものを更新（usernameから自動生成）
    const postsToUpdate = await Post.findAll({ where: { displayName: '' } });
    for (const post of postsToUpdate) {
      // usernameから表示名部分を抽出（元のデータがusernameのみだった場合のため）
      // 既存のユーザー名からdisplayName(username)形式に変換
      await post.update({ displayName: `${post.username}(${post.username})` });
    }
    
    const repliesToUpdate = await Reply.findAll({ where: { displayName: '' } });
    for (const reply of repliesToUpdate) {
      await reply.update({ displayName: `${reply.username}(${reply.username})` });
    }
    
    // 既存のLikeレコードでdisplayNameが空のものを更新
    const likesToUpdate = await Like.findAll({ where: { displayName: '' } });
    for (const like of likesToUpdate) {
      // userIdからユーザー情報を取得できない場合は暫定的にuserIdを使用
      await like.update({ 
        username: like.userId, 
        displayName: like.userId 
      });
    }
    
    console.log('データベースモデルがロードされました');
  } catch (error) {
    console.error('データベースモデルのロード中にエラーが発生しました:', error);
    throw error; // エラーを再スローして、ボットの起動プロセスに伝える
  }
}

module.exports = { sequelize, Post, Like, Reply, initDatabase };