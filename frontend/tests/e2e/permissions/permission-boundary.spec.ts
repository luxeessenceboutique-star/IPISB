import { test, expect } from "../fixtures/auth";

/* FLOW 4 — Permission boundary. A student navigating to a professor/
   admin-only page (Teaching Sessions) must be denied — using the
   application's own existing authorization behavior (backend 403 ->
   frontend "forbidden" state), not an invented one. */
test.describe("Permission boundaries", () => {
  test("student cannot access the Teaching Sessions page", async ({ studentPage: page }) => {
    // Deliberately not in the student sidebar — direct navigation, as a
    // student who guessed/bookmarked the URL would do.
    await page.goto("/dashboard/teaching-sessions");

    await expect(page.getByText(/Réservé aux professeurs et administrateurs|Professors and admins only/)).toBeVisible({ timeout: 10_000 });
    // And no real session data leaks into the DOM regardless of the message shown.
    await expect(page.getByRole("button", { name: /Résultats|Results/ })).toHaveCount(0);
  });

  test("student does not see the Teaching Sessions link in the sidebar at all", async ({ studentPage: page }) => {
    await expect(page.getByRole("link", { name: /Séances|Sessions/ })).toHaveCount(0);
  });
});
