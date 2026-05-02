require("dotenv").config();
const { Client } = require("pg");

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  });

  await client.connect();

  try {
    await client.query("BEGIN");

    const creditCode = `TEST-RF-${Date.now()}`;

    const noteRes = await client.query(
      `
        INSERT INTO receipt.refund_credit_notes (
          credit_code,
          source_order_code,
          customer_name,
          customer_contact,
          refund_amount,
          available_amount,
          status,
          note
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, credit_code, source_order_code, refund_amount, available_amount, status, issued_at
      `,
      [
        creditCode,
        "RF-DEMO-ORDER",
        "Khach Demo",
        "0900000000",
        500000,
        500000,
        "OPEN",
        "Sample data for preview",
      ]
    );

    const note = noteRes.rows[0];

    const appRes = await client.query(
      `
        INSERT INTO receipt.refund_credit_applications (
          credit_note_id,
          target_order_code,
          applied_amount,
          note,
          applied_by
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, credit_note_id, target_order_code, applied_amount, applied_at
      `,
      [note.id, "MAVL-DEMO-TARGET", 120000, "Sample apply preview", "codex"]
    );

    const app = appRes.rows[0];

    const refreshed = await client.query(
      `
        SELECT id, credit_code, refund_amount, available_amount, status, updated_at
        FROM receipt.refund_credit_notes
        WHERE id = $1
      `,
      [note.id]
    );

    await client.query("COMMIT");

    console.log(
      JSON.stringify(
        {
          inserted_note: note,
          inserted_application: app,
          note_after_trigger: refreshed.rows[0],
        },
        null,
        2
      )
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error("Seed preview failed:", error.message);
  process.exit(1);
});

