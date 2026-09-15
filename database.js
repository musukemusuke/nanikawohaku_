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
            // --- 外部キー制約を一時的に無効化 ---
            await sequelize.query('PRAGMA foreign_keys = OFF;');
            console.log('外部キー制約を一時的に無効化しました。');

            // --- データクリーンアップ: Posts_backupテーブルの事前クリーンアップ ---
            console.log('Posts_backupテーブルが存在する場合、削除します...');
            await sequelize.query('DROP TABLE IF EXISTS Posts_backup;');
            console.log('Posts_backupテーブルの事前クリーンアップが完了しました。');

            // --- データクリーンアップ: sync前にNULL/空文字列/重複のIDがないことを確認 ---
            // Postsテーブルが存在するか確認
            const [tableCheck] = await sequelize.query("SELECT name FROM sqlite_master WHERE type='table' AND name='Posts';");
            if (tableCheck.length > 0) {
                console.log('Postsテーブルが存在します。IDのクリーンアップを開始します...');
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

                // NULLのIDを修正
                console.log('NULLのIDを持つ投稿をチェックします...');
                const [nullIdRows] = await sequelize.query('SELECT rowid FROM Posts WHERE id IS NULL;');
                if (nullIdRows.length > 0) {
                    console.log(`${nullIdRows.length}個のNULLのIDを持つ投稿を検出しました。修正します...`);
                    for (const row of nullIdRows) {
                        const newId = nanoid(NANOID_LENGTH);
                        await sequelize.query(`UPDATE Posts SET id = '${newId}' WHERE rowid = ${row.rowid};`);
                        console.log(`NULLのIDを持つ投稿 (rowid: ${row.rowid}) を修正しました。新しいID: ${newId}`);
                    }
                    console.log('NULLのID修正が完了しました。');
                } else {
                    console.log('NULLのIDを持つ投稿は見つかりませんでした。');
                }

                // 空文字列のIDを修正
                console.log('空文字列のIDを持つ投稿をチェックします...');
                const [emptyIdRows] = await sequelize.query("SELECT rowid FROM Posts WHERE id = '';");
                if (emptyIdRows.length > 0) {
                    console.log(`${emptyIdRows.length}個の空文字列のIDを持つ投稿を検出しました。修正します...`);
                    for (const row of emptyIdRows) {
                        const newId = nanoid(NANOID_LENGTH);
                        await sequelize.query(`UPDATE Posts SET id = '${newId}' WHERE rowid = ${row.rowid};`);
                        console.log(`空文字列のIDを持つ投稿 (rowid: ${row.rowid}) を修正しました。新しいID: ${newId}`);
                    }
                    console.log('空文字列のID修正が完了しました。');
                } else {
                    console.log('空文字列のIDを持つ投稿は見つかりませんでした。');
                }

                // 重複するIDを修正
                console.log('重複するIDを持つ投稿をチェックします...');
                const [duplicateIds] = await sequelize.query(`
                    SELECT id, COUNT(*) as count
                    FROM Posts
                    WHERE id IS NOT NULL AND id != ''
                    GROUP BY id
                    HAVING count > 1;
                `);

                if (duplicateIds.length > 0) {
                    console.log(`${duplicateIds.length}種類の重複するIDを検出しました。修正します...`);
                    for (const dup of duplicateIds) {
                        console.log(`重複ID: ${dup.id} (${dup.count}個)`);
                        // 重複するIDを持つレコードのうち、最初の1つを除いて全て新しいIDに更新
                        const [rowsToUpdate] = await sequelize.query(`
                            SELECT rowid FROM Posts WHERE id = '${dup.id}' LIMIT ${dup.count - 1};
                        `);
                        for (const row of rowsToUpdate) {
                            const newId = nanoid(NANOID_LENGTH);
                            await sequelize.query(`UPDATE Posts SET id = '${newId}' WHERE rowid = ${row.rowid};`);
                            console.log(`重複IDを持つ投稿 (rowid: ${row.rowid}) を修正しました。新しいID: ${newId}`);
                        }
                    }
                    console.log('重複するIDの修正が完了しました。');
                } else {
                    console.log('重複するIDを持つ投稿は見つかりませんでした。');
                }

                // 最終検証
                console.log('IDの最終検証を行います...');
                const [finalNulls] = await sequelize.query('SELECT rowid FROM Posts WHERE id IS NULL OR id = \'\';');
                const [finalDuplicates] = await sequelize.query(`
                    SELECT id, COUNT(*) as count
                    FROM Posts
                    WHERE id IS NOT NULL AND id != ''
                    GROUP BY id
                    HAVING count > 1;
                `);

                if (finalNulls.length > 0 || finalDuplicates.length > 0) {
                    console.error(`警告: IDクリーンアップ後に問題が残っています。NULL/空文字列のID: ${finalNulls.length}個, 重複IDの種類: ${finalDuplicates.length}個`);
                } else {
                    console.log('IDのクリーンアップと検証が成功しました。');
                }

            } else {
                console.log('Postsテーブルが存在しません。IDのクリーンアップはスキップします。');
            }
            // --- データクリーンアップ終了 ---

            // モデルの同期
            console.log('データベースモデルを同期しています...');
            await sequelize.sync({ alter: true });
            console.log('データベースモデルの同期が完了しました。');

        } catch (error) {
            console.error('データベースモデルのロード中にエラーが発生しました:', error);
            throw error; // エラーを再スローしてアプリケーションの起動を停止
        } finally {
            // --- 外部キー制約を再度有効化 ---
            await sequelize.query('PRAGMA foreign_keys = ON;');
            console.log('外部キー制約を再度有効化しました。');
        }
}

module.exports = { sequelize, Post, Like, Reply, initDatabase };