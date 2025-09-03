exports.up = function(knex) {
  return knex.schema.createTable('players', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('username').unique().notNullable();
    table.string('email').unique().notNullable();
    table.string('password').notNullable();
    table.string('wallet_address').unique().notNullable();
    table.boolean('is_verified').defaultTo(false);
    table.decimal('balance', 18, 9).defaultTo(0);
    table.integer('elo_rating').defaultTo(1200);
    table.json('stats').defaultTo({
      gamesPlayed: 0,
      gamesWon: 0,
      gamesLost: 0,
      winRate: 0,
      totalWagered: 0,
      totalWinnings: 0,
      longestWinStreak: 0,
      currentWinStreak: 0
    });
    table.json('settings').defaultTo({
      notifications: true,
      autoMatch: false,
      preferredWager: 0.1,
      theme: 'dark'
    });
    table.timestamp('last_login').nullable();
    table.timestamps(true, true);
    
    // Indexes
    table.index(['wallet_address']);
    table.index(['elo_rating']);
    table.index(['username']);
    table.index(['email']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('players');
};