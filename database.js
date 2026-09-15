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
    // SQLiteの外部キーチェックを一時的に無効にする
    await sequelize.query('PRAGMA foreign_keys = OFF;');

    // モデルの変更をデータベースに同期（alter: trueでカラムの追加に対応）
    await sequelize.sync({ alter: true });
    console.log('データベースモデルがロードされました');

    // 外部キーチェックを再度有効にする
    await sequelize.query('PRAGMA foreign_keys = ON;');
  } catch (error) {
    console.error('データベースモデルのロード中にエラーが発生しました:', error);
    throw error; // エラーを再スローして、ボットの起動プロセスに伝える
  }
}

module.exports = { sequelize, Post, Like, Reply, initDatabase };