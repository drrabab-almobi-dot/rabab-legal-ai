import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  db,
  consultationsTable,
  orgMembersTable,
  organizationsTable,
  packagesTable,
  quotaAlertLogTable,
  serviceSessionsTable,
  subscriptionsTable,
  usageLogTable,
  usersTable,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";

// quota.ts loads the alert sender. Set test mode before importing it so this
// regression test never sends threshold emails.
process.env.NODE_ENV = "test";
const {
  checkAndReserveService,
  commitService,
  releaseExpiredServiceReservations,
  releaseService,
} = await import("./quota");

const suffix = randomUUID().slice(0, 8);
const createdUserIds: number[] = [];
let packageId: number | undefined;
let subscriptionId: number | undefined;
let organizationId: number | undefined;
let trialPackageId: number | undefined;
let trialSubscriptionId: number | undefined;
let trialUserId: number | undefined;

async function createUser(label: string) {
  const [user] = await db.insert(usersTable).values({
    name: `Quota ${label}`,
    email: `quota-${label}-${suffix}@test.local`,
    passwordHash: "quota-test-password-hash",
    phoneVerified: true,
  }).returning();
  createdUserIds.push(user.id);
  return user;
}

try {
  const owner = await createUser("owner");
  const memberOne = await createUser("member-one");
  const memberTwo = await createUser("member-two");

  const [pkg] = await db.insert(packagesTable).values({
    nameAr: `باقة اختبار الحصص ${suffix}`,
    nameEn: `Quota Test ${suffix}`,
    price: "1.00",
    type: "business",
    consultationsAllowed: 1,
    contractsAllowed: 1,
    reviewsAllowed: 1,
    seats: 3,
  }).returning();
  packageId = pkg.id;

  const [subscription] = await db.insert(subscriptionsTable).values({
    userId: owner.id,
    packageId: pkg.id,
    status: "active",
    endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
  }).returning();
  subscriptionId = subscription.id;

  const [organization] = await db.insert(organizationsTable).values({
    ownerId: owner.id,
    name: `منشأة اختبار الحصص ${suffix}`,
  }).returning();
  organizationId = organization.id;

  await db.insert(orgMembersTable).values([
    {
      orgId: organization.id,
      userId: memberOne.id,
      email: memberOne.email,
      status: "active",
      joinedAt: new Date(),
    },
    {
      orgId: organization.id,
      userId: memberTwo.id,
      email: memberTwo.email,
      status: "active",
      joinedAt: new Date(),
    },
  ]);

  const [firstAttempt, secondAttempt] = await Promise.all([
    checkAndReserveService(memberOne.id, "consultation", randomUUID()),
    checkAndReserveService(memberTwo.id, "consultation", randomUUID()),
  ]);
  const successfulAttempt = [firstAttempt, secondAttempt].find((attempt) => attempt.ok);
  const rejectedAttempt = [firstAttempt, secondAttempt].find((attempt) => !attempt.ok);

  assert.ok(successfulAttempt?.sessionId, "exactly one member must reserve the final shared consultation");
  assert.ok(rejectedAttempt && !rejectedAttempt.ok, "the concurrent second reservation must be rejected");
  if (!successfulAttempt?.sessionId) throw new Error("missing winning reservation");
  const winningSessionId = successfulAttempt.sessionId;
  assert.equal(successfulAttempt.subscriptionId, subscription.id, "member reservation must return the owner's subscription");

  const pendingAfterRace = await db.select().from(serviceSessionsTable).where(
    and(
      eq(serviceSessionsTable.subscriptionId, subscription.id),
      eq(serviceSessionsTable.serviceType, "consultation"),
      eq(serviceSessionsTable.counted, false),
    ),
  );
  assert.equal(pendingAfterRace.length, 1, "only one pending shared reservation may exist");

  await releaseService(winningSessionId);

  const retry = await checkAndReserveService(memberTwo.id, "consultation", randomUUID());
  assert.ok(retry.ok && retry.sessionId, "releasing a pending reservation must free the shared slot");
  if (!retry.sessionId) throw new Error("missing retry reservation");
  const retrySessionId = retry.sessionId;
  assert.equal(retry.subscriptionId, subscription.id);

  await commitService(retrySessionId);
  const [updatedSubscription] = await db.select().from(subscriptionsTable)
    .where(eq(subscriptionsTable.id, subscription.id));
  assert.equal(updatedSubscription.consultationsUsed, 1, "only the committed reservation increments shared usage");

  // An abandoned operation must not occupy the remaining team capacity forever.
  await db.update(packagesTable)
    .set({ consultationsAllowed: 2 })
    .where(eq(packagesTable.id, pkg.id));
  const abandoned = await checkAndReserveService(memberOne.id, "consultation", randomUUID());
  assert.ok(abandoned.ok && abandoned.sessionId, "a second shared slot should be reservable");
  if (!abandoned.sessionId) throw new Error("missing abandoned reservation");
  const abandonedSessionId = abandoned.sessionId;
  await db.update(serviceSessionsTable)
    .set({ graceEnd: new Date(Date.now() - 1_000) })
    .where(eq(serviceSessionsTable.id, abandonedSessionId));

  const immediateReplacement = await checkAndReserveService(memberOne.id, "consultation", randomUUID());
  assert.ok(
    immediateReplacement.ok && immediateReplacement.sessionId,
    "an expired paid reservation must free capacity before the background reaper runs",
  );
  if (!immediateReplacement.sessionId) throw new Error("missing immediate replacement");
  await commitService(immediateReplacement.sessionId);
  await commitService(abandonedSessionId);
  const [afterExpiryRace] = await db.select().from(subscriptionsTable)
    .where(eq(subscriptionsTable.id, subscription.id));
  assert.equal(afterExpiryRace.consultationsUsed, 2, "an expired paid reservation must not commit after its replacement");

  const releasedExpired = await releaseExpiredServiceReservations();
  assert.ok(releasedExpired >= 0, "the reaper remains safe after commit rejects an expired reservation");

  // Two pending consultations for one member must retain distinct, explicit
  // reservation links; the chat route must not choose whichever row is newest.
  await db.update(packagesTable)
    .set({ consultationsAllowed: 5 })
    .where(eq(packagesTable.id, pkg.id));
  const firstPending = await checkAndReserveService(memberOne.id, "consultation", randomUUID());
  const secondPending = await checkAndReserveService(memberOne.id, "consultation", randomUUID());
  assert.ok(firstPending.sessionId && secondPending.sessionId);
  if (!firstPending.sessionId || !secondPending.sessionId) throw new Error("missing operation reservations");
  const firstPendingSessionId = firstPending.sessionId;
  const secondPendingSessionId = secondPending.sessionId;
  assert.notEqual(firstPendingSessionId, secondPendingSessionId);

  const firstInsert = await db.execute(sql`
    INSERT INTO consultations (user_id, subscription_id, service_session_id, title)
    VALUES (${memberOne.id}, ${subscription.id}, ${firstPendingSessionId}, ${`الاستشارة الأولى ${suffix}`})
    RETURNING id
  `);
  const secondInsert = await db.execute(sql`
    INSERT INTO consultations (user_id, subscription_id, service_session_id, title)
    VALUES (${memberOne.id}, ${subscription.id}, ${secondPendingSessionId}, ${`الاستشارة الثانية ${suffix}`})
    RETURNING id
  `);
  const firstConsultationId = Number((firstInsert.rows[0] as { id: number }).id);
  const secondConsultationId = Number((secondInsert.rows[0] as { id: number }).id);
  await assert.rejects(
    db.execute(sql`
      INSERT INTO consultations (user_id, subscription_id, service_session_id, title)
      VALUES (${memberOne.id}, ${subscription.id}, ${firstPendingSessionId}, ${`نسخة مكررة ${suffix}`})
    `),
    "one reservation must never bind two consultations",
  );
  await releaseService(firstPendingSessionId);
  const afterRelease = await db.execute(
    sql`SELECT service_session_id FROM consultations WHERE id = ${firstConsultationId}`,
  );
  assert.equal(afterRelease.rows[0]?.service_session_id, null, "releasing an abandoned reservation clears only its consultation link");
  const stillBound = await db.execute(
    sql`SELECT service_session_id FROM consultations WHERE id = ${secondConsultationId}`,
  );
  assert.equal(Number(stillBound.rows[0]?.service_session_id), secondPendingSessionId, "another open consultation keeps its own reservation");
  await releaseService(secondPendingSessionId);

  const trialUser = await createUser("trial");
  trialUserId = trialUser.id;
  const [trialPackage] = await db.insert(packagesTable).values({
    nameAr: `تجربة اختبار ${suffix}`,
    nameEn: `Trial Test ${suffix}`,
    price: "0.00",
    type: "free",
    consultationsAllowed: 0,
    contractsAllowed: 0,
    reviewsAllowed: 0,
    seats: 1,
  }).returning();
  trialPackageId = trialPackage.id;
  const [trialSubscription] = await db.insert(subscriptionsTable).values({
    userId: trialUser.id,
    packageId: trialPackage.id,
    status: "active",
    endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
  }).returning();
  trialSubscriptionId = trialSubscription.id;
  const trialAttempts = await Promise.all([
    checkAndReserveService(trialUser.id, "consultation", "trial-retry-race"),
    checkAndReserveService(trialUser.id, "contract_draft", randomUUID()),
    checkAndReserveService(trialUser.id, "contract_review", randomUUID()),
    checkAndReserveService(trialUser.id, "consultation", randomUUID()),
  ]);
  assert.equal(trialAttempts.filter((attempt) => attempt.ok).length, 3, "only three trial reservations may exist concurrently");
  assert.equal(trialAttempts.filter((attempt) => !attempt.ok).length, 1);
  const retryableTrialReservation = trialAttempts[0].sessionId;
  if (!retryableTrialReservation) throw new Error("missing trial reservation for retry race");
  const [retryDuringCommit] = await Promise.all([
    checkAndReserveService(trialUser.id, "consultation", "trial-retry-race"),
    checkAndReserveService(trialUser.id, "consultation", "trial-retry-race"),
  ]);
  if (!retryDuringCommit.sessionId) throw new Error("missing retry reservation");
  const [, retryAfterCommit] = await Promise.all([
    commitService(retryDuringCommit.sessionId),
    checkAndReserveService(trialUser.id, "consultation", "trial-retry-race"),
  ]);
  assert.ok(retryAfterCommit.ok && retryAfterCommit.sessionId);
  assert.equal(
    retryAfterCommit.sessionId,
    retryDuringCommit.sessionId,
    "a retry racing with completion must reuse the counted grace session",
  );
  const expiredTrialReservation = trialAttempts
    .find((attempt) => attempt.ok && attempt.sessionId !== retryableTrialReservation)
    ?.sessionId;
  if (!expiredTrialReservation) throw new Error("missing trial reservation to expire");
  await db.update(serviceSessionsTable)
    .set({ graceEnd: new Date(Date.now() - 1_000) })
    .where(eq(serviceSessionsTable.id, expiredTrialReservation));
  const trialReplacement = await checkAndReserveService(trialUser.id, "consultation", randomUUID());
  assert.ok(
    trialReplacement.ok && trialReplacement.sessionId,
    "an expired trial reservation must free capacity before the background reaper runs",
  );
  if (!trialReplacement.sessionId) throw new Error("missing trial replacement");
  await commitService(trialReplacement.sessionId);
  await commitService(expiredTrialReservation);
  const [trialCount] = await db.select({ total: sql<number>`COUNT(*)::int` })
    .from(serviceSessionsTable)
    .where(and(eq(serviceSessionsTable.userId, trialUser.id), eq(serviceSessionsTable.counted, true)));
  assert.equal(trialCount.total, 2, "only the retry-race completion and replacement may count; the expired trial reservation must not");

  console.log("shared quota concurrency, expiry, operation-binding, and trial-cap tests passed");
} finally {
  if (createdUserIds.length > 0) {
    await db.delete(quotaAlertLogTable).where(inArray(quotaAlertLogTable.userId, createdUserIds));
    await db.delete(usageLogTable).where(inArray(usageLogTable.userId, createdUserIds));
    await db.delete(serviceSessionsTable).where(inArray(serviceSessionsTable.userId, createdUserIds));
    await db.delete(consultationsTable).where(inArray(consultationsTable.userId, createdUserIds));
  }
  if (organizationId) await db.delete(orgMembersTable).where(eq(orgMembersTable.orgId, organizationId));
  if (organizationId) await db.delete(organizationsTable).where(eq(organizationsTable.id, organizationId));
  if (subscriptionId) await db.delete(subscriptionsTable).where(eq(subscriptionsTable.id, subscriptionId));
  if (packageId) await db.delete(packagesTable).where(eq(packagesTable.id, packageId));
  if (trialSubscriptionId) await db.delete(subscriptionsTable).where(eq(subscriptionsTable.id, trialSubscriptionId));
  if (trialPackageId) await db.delete(packagesTable).where(eq(packagesTable.id, trialPackageId));
  if (createdUserIds.length > 0) await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
}