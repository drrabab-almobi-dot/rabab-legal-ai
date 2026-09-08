import fs from 'node:fs';

const file = 'artifacts/api-server/src/routes/chat.ts';
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(label, before, after) {
  if (source.includes(after)) {
    console.log(`skip ${label}: already applied`);
    return;
  }
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`repair target not found: ${label}`);
  const second = source.indexOf(before, first + before.length);
  if (second >= 0) throw new Error(`repair target is ambiguous: ${label}`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
  console.log(`applied ${label}`);
}

replaceOnce(
  'allow READY on first attachment turn',
  '      const intakeState = isInitialAttachmentIntake ? "collecting" : intake.state;',
  '      const intakeState = intake.state;',
);

replaceOnce(
  'remember intake instruction position',
  '  if (isAttachmentIntakeTurn) {\n    contextMessages.push({\n      role: "system",\n      content: attachmentFactIntakePrompt(isInitialAttachmentIntake),\n    });',
  '  if (isAttachmentIntakeTurn) {\n    const intakeInstructionIndex = contextMessages.length;\n    contextMessages.push({\n      role: "system",\n      content: attachmentFactIntakePrompt(isInitialAttachmentIntake),\n    });',
);

replaceOnce(
  'remove intake-only instruction before final legal analysis',
  '      // Facts are now complete. Persist the hidden state for auditability and\n      // pass its concise summary into the verified analysis that follows.\n      await db.insert(consultationMessagesTable).values({',
  '      // The intake-only instruction must not leak into final legal analysis.\n      contextMessages.splice(intakeInstructionIndex, 1);\n\n      // Facts are now complete. Persist the hidden state for auditability and\n      // pass its concise summary into the verified analysis that follows.\n      await db.insert(consultationMessagesTable).values({',
);

replaceOnce(
  'preserve client message when attachment intake provider fails',
  '      await db.delete(consultationMessagesTable)\n        .where(eq(consultationMessagesTable.id, savedUserMessage.id))\n        .catch(() => {});\n      if (reservedSessionId) await releaseService(reservedSessionId).catch(() => {});',
  '      // Preserve the client message and extracted facts for retry/resume.\n      if (reservedSessionId) await releaseService(reservedSessionId).catch(() => {});',
);

replaceOnce(
  'preserve client message when legal verification fails',
  '    await db.delete(consultationMessagesTable)\n      .where(eq(consultationMessagesTable.id, savedUserMessage.id))\n      .catch((error) => req.log.warn({ error }, "Failed to remove provisional message after verifier outage"));\n    if (reservedSessionId) {',
  '    // Preserve the client message and facts; only release the quota reservation.\n    if (reservedSessionId) {',
);

replaceOnce(
  'preserve client message when OpenAI fails',
  '    // Remove the user message we saved so quota isn\'t wasted on a failed call.\n    // Wrapped in its own try/catch so a DB hiccup during cleanup does NOT convert\n    // the friendly Arabic OpenAI error into an opaque 500 for the user.\n    try {\n      const saved = await db.select().from(consultationMessagesTable)\n        .where(eq(consultationMessagesTable.consultationId, id))\n        .orderBy(asc(consultationMessagesTable.createdAt));\n      const last = saved[saved.length - 1];\n      if (last?.role === "user") {\n        await db.delete(consultationMessagesTable).where(eq(consultationMessagesTable.id, last.id));\n      }\n    } catch (cleanupErr) {\n      req.log.warn({ err: cleanupErr }, "Failed to remove stale user message after OpenAI error — continuing");\n    }\n\n',
  '    // Preserve the client message and facts so this consultation can resume after provider recovery.\n\n',
);

replaceOnce(
  'mark attachment interview completed after delivered final result',
  '  if (attachmentInterview.state === "ready") {\n    await db.insert(consultationMessagesTable).values({',
  '  if (isAttachmentIntakeTurn || attachmentInterview.state === "ready") {\n    await db.insert(consultationMessagesTable).values({',
);

replaceOnce(
  'correct durable-message comment',
  '  // Save the message provisionally. If live-source verification cannot run, the\n  // row and any first-message quota reservation are released before responding.',
  '  // Save the client message durably. Provider or verification failures release\n  // quota reservations but never erase client facts or attachments.',
);

fs.writeFileSync(file, source);
console.log('PR22 guarded repair complete');
