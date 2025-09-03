exports.up = function(knex) {
  return knex.schema.createTable('games', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('game_type').notNullable(); // 'duel', 'tournament', 'practice'
    table.decimal('wager_amount', 18, 9).notNullable();
    table.boolean('is_private').defaultTo(false);
    table.integer('max_players').defaultTo(2);
    table.integer('time_limit').defaultTo(300); // seconds
    table.string('status').defaultTo('waiting'); // 'waiting', 'active', 'completed', 'cancelled'
    table.uuid('created_by').references('id').inTable('players').onDelete('CASCADE');
    table.json('players').defaultTo('[]'); // Array of player IDs
    table.json('settings').defaultTo('{}');
    table.json('game_data').defaultTo('{}'); // Game state, moves, etc.
    table.uuid('winner_id').references('id').inTable('players').onDelete('SET NULL').nullable();
    table.json('final_scores').defaultTo('{}');
    table.json('elo_changes').defaultTo('{}');
    table.decimal('platform_fee', 18, 9).defaultTo(0);
    table.string('escrow_account').nullable();
    table.string('transaction_signature').nullable();
    table.timestamp('started_at').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamps(true, true);
    
    // Indexes
    table.index(['status']);
    table.index(['game_type']);
    table.index(['wager_amount']);
    table.index(['created_by']);
    table.index(['winner_id']);
    table.index(['created_at']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('games');
};