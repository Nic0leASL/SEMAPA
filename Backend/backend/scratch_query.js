import cassandra from 'cassandra-driver';

const client = new cassandra.Client({
  contactPoints: ['127.0.0.1'],
  localDataCenter: 'datacenter1',
  keyspace: 'semapa',
  protocolOptions: { port: 9042 }
});

async function main() {
  await client.connect();
  console.log("Connected to Cassandra.");

  // 1. Query by CI exact match
  console.log("\n--- Querying by CI exact: '5715057' ---");
  const res1 = await client.execute("SELECT * FROM contratos_by_ci WHERE ci_titular = '5715057'");
  console.log("Result count:", res1.rows.length);
  for (const r of res1.rows) {
    console.log(r);
  }

  // 2. Query by CI with suffix
  console.log("\n--- Querying by CI with suffix: '5715057 CBBA' ---");
  const res2 = await client.execute("SELECT * FROM contratos_by_ci WHERE ci_titular = '5715057 CBBA'");
  console.log("Result count:", res2.rows.length);
  for (const r of res2.rows) {
    console.log(r);
  }

  // 3. Query contract directly
  console.log("\n--- Querying by contract: 'CT-00000023' ---");
  const res3 = await client.execute("SELECT * FROM contratos WHERE numero_contrato = 'CT-00000023'");
  console.log("Result count:", res3.rows.length);
  for (const r of res3.rows) {
    console.log(r);
  }

  if (res3.rows.length > 0) {
    const medId = res3.rows[0].medidor_iot;
    console.log(`\n--- Readings for medidor ${medId} ---`);
    const resReadings = await client.execute("SELECT * FROM lecturas_by_medidor WHERE medidor_iot = ?", [medId], { prepare: true });
    console.log("Readings count:", resReadings.rows.length);
    if (resReadings.rows.length > 0) {
      console.log("Sample reading:", resReadings.rows[0]);
    }
  }

  await client.shutdown();
}

main().catch(console.error);
