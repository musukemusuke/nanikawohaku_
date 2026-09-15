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
    primaryKey: true,
    allowNull: false, // 明示的にNOT NULLを指定
    unique: true      // 明示的にUNIQUEを指定
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
        // スキーマ変更とデータクリーンアップのために一時的に外部キーチェックを無効化
        await sequelize.query('PRAGMA foreign_keys = OFF;');

        // --- データクリーンアップ: sync前にNULLのIDがないことを確認 ---
        // Postsテーブルが存在するか確認
        const [tableCheck] = await sequelize.query("SELECT name FROM sqlite_master WHERE type='table' AND name='Posts';");
        if (tableCheck.length > 0) {
            console.log('Postsテーブルが存在します。NULLのIDを修正します...');
            // idカラムが存在しない場合に備えて追加
            const [columnCheck] = await sequelize.query("PRAGMA table_info(Posts);");
            const idColumnExists = columnCheck.some(col => col.name === 'id');

            if (!idColumnExists) {
                console.log('Postsテーブルにidカラムが存在しません。追加します...');
                await sequelize.query('ALTER TABLE Posts ADD COLUMN id TEXT;');
                console.log('Postsテーブルにidカラムを追加しました。');
            } else {
                console.log('Postsテーブルにidカラムは既に存在します。');
            }

            // モデルが完全に同期されていない可能性があるため、生のクエリを使用してNULLのIDを持つ投稿をフェッチ
            const [rowsToFix] = await sequelize.query('SELECT rowid FROM Posts WHERE id IS NULL;');
            console.log('検出されたNULLのIDを持つ投稿:', rowsToFix);

            if (rowsToFix.length > 0) {
                console.log(`${rowsToFix.length}個のNULLのIDを持つ投稿を検出しました。修正します...`);
                for (const row of rowsToFix) {
                    const newId = nanoid(NANOID_LENGTH);
                    await sequelize.query(`UPDATE Posts SET id = '${newId}' WHERE rowid = ${row.rowid};`);
                    console.log(`NULLのIDを持つ投稿 (rowid: ${row.rowid}) を修正しました。新しいID: ${newId}`);
                }
                console.log('NULLのID修正が完了しました。');

                // 修正後にNULLのIDが残っていないか検証
                const [remainingNulls] = await sequelize.query('SELECT rowid FROM Posts WHERE id IS NULL;');
                if (remainingNulls.length > 0) {
                    console.error(`警告: NULLのIDを持つ投稿がまだ${remainingNulls.length}個残っています！`);
                }
                else {
                    console.log('NULLのIDを持つ投稿はすべて修正されました。');
                }
            }
            else {
                console.log('NULLのIDを持つ投稿は見つかりませんでした。');
            }
        }
        else {
            console.log('Postsテーブルが存在しません。NULLのID修正はスキップします。');
        }
        // --- データクリーンアップ終了 ---

        // モデルをデータベースと同期
        await sequelize.sync({ alter: true });
        console.log('データベースモデルがロードされました');

    } catch (error) {
        console.error('データベースモデルのロード中にエラーが発生しました:', error);
        throw error; // エラーを再スローして、ボットの起動プロセスに伝える
    } finally {
        // 常に外部キーチェックを再度有効化
        await sequelize.query('PRAGMA foreign_keys = ON;');
    }
}

module.exports = { sequelize, Post, Like, Reply, initDatabase };