exports.up = function(knex) {
  return knex.schema.createTable('tournaments', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.text('description').nullable();
    table.string('tournament_type').notNullable(); // 'single_elimination', 'double_elimination', 'round_robin'
    table.decimal('entry_fee', 18, 9).notNullable();
    table.decimal('prize_pool', 18, 9).defaultTo(0);
    table.integer('max_participants').notNullable();
    table.integer('min_participants').defaultTo(2);
    table.string('status').defaultTo('registration'); // 'registration', 'active', 'completed', 'cancelled'
    table.uuid('created_by').references('id').inTable('players').onDelete('CASCADE');
    table.json('participants').defaultTo('[]'); // Array of player IDs
    table.json('brackets').defaultTo('{}'); // Tournament bracket structure
    table.json('settings').defaultTo('{}');
    table.json('prize_distribution').defaultTo('{}'); // How prizes are distributed
    table.uuid('winner_id').references('id').inTable('players').onDelete('SET NULL').nullable();
    table.timestamp('registration_ends_at').notNullable();
    table.timestamp('starts_at').notNullable();
    table.timestamp('completed_at').nullable();
    table.timestamps(true, true);
    
    // Indexes
    table.index(['status']);
    table.index(['tournament_type']);
    table.index(['entry_fee']);
    table.index(['created_by']);
    table.index(['starts_at']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('tournaments');
};