import { test, expect } from "@playwright/test";
import { clearTestDatabase } from "./helpers/db";
import {
  createGroup,
  createTestUsers,
  generateInviteLink,
  joinGroupByInvite,
  seedBrowserAuth,
} from "./helpers/api";
import { createUserFactory } from "./helpers/factory";

test.describe("group membership", () => {
  test.beforeEach(async () => {
    await clearTestDatabase();
  });

  test("20 invited users appear once each on the group page", async ({ page, request }) => {
    const factory = createUserFactory();
    const sessions = await createTestUsers(request, factory.users(20));
    const owner = sessions[0];

    const group = await createGroup(request, owner.token, `${factory.runId} Watch Crew`);
    const invite = await generateInviteLink(request, owner.token, group._id);

    for (const session of sessions.slice(1)) {
      await joinGroupByInvite(request, session.token, invite.token);
    }

    // Repeat a couple of joins to prove the invite endpoint is idempotent.
    await joinGroupByInvite(request, sessions[1].token, invite.token);
    await joinGroupByInvite(request, sessions[2].token, invite.token);

    await seedBrowserAuth(page, owner);
    await page.goto(`/group/${group._id}`);

    await expect(page.getByRole("heading", { name: "Group Members" })).toBeVisible();
    await expect(page.getByTestId("group-member-card")).toHaveCount(20);

    for (const session of sessions) {
      await expect(page.getByTestId("group-member-card").filter({ hasText: session.user.name })).toHaveCount(1);
    }
  });
});
