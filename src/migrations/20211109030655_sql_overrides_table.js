exports.up = async function (knex) {
    return knex.schema
        .createTable("kpop_videos_sql_overrides", (table) => {
            table.increments("id").primary();
            table.string("query").notNullable();
            table.string("reason").notNullable();
        })
        .then(async () => {
            [
                `INSERT INTO kpop_videos_sql_overrides VALUES (1,"UPDATE app_kpop SET vtype = \'duplicate\' WHERE vlink = \'cWDzVr3vPsg\';",'Jet Coaster love (jp) | main not available in NA');`,
                `INSERT INTO kpop_videos_sql_overrides VALUES (2,"UPDATE app_kpop SET vtype = \'main\' WHERE vlink = \'siOg7ETEkbs\';",'Jet Coaster love (jp) | main not available in NA');`,
                `INSERT INTO kpop_videos_sql_overrides VALUES (3,"UPDATE app_kpop SET vtype = \'duplicate\' WHERE vlink = \'q6tfl41YlJ8\';",'Speed Up (jp) | main not available in NA');`,
                `INSERT INTO kpop_videos_sql_overrides VALUES (4,"UPDATE app_kpop SET vtype = \'main\' WHERE vlink = \'bEGQ7qlX6EY\';",'Speed Up (jp) | main not available in NA');`,
                `INSERT INTO kpop_videos_sql_overrides VALUES (5,"UPDATE app_kpop SET vtype = \'duplicate\' WHERE vlink = \'ogVMxZTcoCI\';",'Electric Boy (jp) | main not available in NA');`,
                `INSERT INTO kpop_videos_sql_overrides VALUES (6,"UPDATE app_kpop SET vtype = \'main\' WHERE vlink = \'4hES5YumoxA\';",'Electric Boy (jp) | main not available in NA');`,
                `INSERT INTO kpop_videos_sql_overrides VALUES (7,"UPDATE app_kpop_group SET name = REPLACE(name, \' ☮\', \'\');",'Remove ☮ symbols from artist names');`,
                `INSERT INTO kpop_videos_sql_overrides VALUES (8,"UPDATE app_kpop_group SET name = \'Car the garden\' WHERE id = 700;",'Remove comma from \"Car, the garden\"');`,
                `INSERT INTO kpop_videos_sql_overrides VALUES (9,"UPDATE app_kpop SET vtype = \'duplicate\' WHERE vlink = \'brnCe8lL7l4\';",'Day by Day - T-ara | swap main and dance versions. Main version is 15 minutes long ');`,
                `INSERT INTO kpop_videos_sql_overrides VALUES (10,"UPDATE app_kpop SET vtype = \'main\' WHERE vlink = \'kb6mCsvLqP0\';",'Day by Day - T-ara | swap main and dance versions. Main version is 15 minutes long ');`,
                `INSERT INTO kpop_videos_sql_overrides VALUES (11,"UPDATE app_kpop SET vtype = \'alternate\' WHERE vlink = \'afwK0Mv0IsY\';",'Roly Poly - T-ara | swap long with short version');`,
                `INSERT INTO kpop_videos_sql_overrides VALUES (12,"UPDATE app_kpop SET vtype = \'main\' WHERE vlink = \'3Xu-GYneWQ8\';",'Roly Poly - T-ara | swap long with short version');`,
                `INSERT INTO kpop_videos_sql_overrides VALUES (13,"UPDATE app_kpop SET vtype = \'alternate\' WHERE vlink = \'gJNWy8gEOHs\';",'Come Over Tonight - Wonho | swap with better quality version');`,
                `INSERT INTO kpop_videos_sql_overrides VALUES (14,"UPDATE app_kpop SET vtype = \'main\' WHERE vlink = \'USPd8yM_jHk\';",'Come Over Tonight - Wonho | swap with better quality version');`,
                `INSERT INTO kpop_videos_sql_overrides VALUES (15,"UPDATE app_kpop SET vtype = \'alternate\' WHERE vlink = \'QmgcyLozkbQ\';",'Dionysus - BTS | swap with better quality version');`,
                `INSERT INTO kpop_videos_sql_overrides VALUES (16,"UPDATE app_kpop SET vtype = \'main\' WHERE vlink = \'bccr1BwNI0Y\';",'Dionysus - BTS | swap with better quality version');`,
            ].forEach(async (x) => {
                await knex.raw(x);
            });
        });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("kpop_videos_sql_overrides");
};
