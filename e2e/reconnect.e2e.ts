import { expect, test, type Page } from "@playwright/test"

interface StoredSession {
  roomCode: string
  name: string
  savedAt: number
}

interface GameCase {
  name: string
  route: string
  storageKey: string
  create: (page: Page, playerName: string) => Promise<void>
}

async function createSharedRoom(page: Page, playerName: string, createLabel: string) {
  await page.getByPlaceholder("Your name").fill(playerName)
  await page.getByRole("button", { name: createLabel, exact: true }).click()
}

async function createCardRoom(
  page: Page,
  playerName: string,
  createLabel: string,
) {
  await page.locator('[data-slot="card-title"]', { hasText: "Create Game" }).click()
  await page.getByLabel("Your Name").fill(playerName)
  await page.getByRole("button", { name: createLabel, exact: true }).click()
}

const games: GameCase[] = [
  {
    name: "Type Race",
    route: "/games/typerace",
    storageKey: "typerace:lastSession",
    create: (page, name) => createSharedRoom(page, name, "Create Type Race Room"),
  },
  {
    name: "Drawing",
    route: "/games/drawing",
    storageKey: "drawing:lastSession",
    create: (page, name) => createSharedRoom(page, name, "Create Drawing Room"),
  },
  {
    name: "Word Chain",
    route: "/games/wordchain",
    storageKey: "wordchain:lastSession",
    create: (page, name) => createSharedRoom(page, name, "Create Word Chain Room"),
  },
  {
    name: "Word Scramble",
    route: "/games/word-scramble",
    storageKey: "word-scramble:lastSession",
    create: (page, name) => createSharedRoom(page, name, "Create Multiplayer Room"),
  },
  {
    name: "Sync Up",
    route: "/games/sync-up",
    storageKey: "sync-up:lastSession",
    create: (page, name) => createSharedRoom(page, name, "Create Sync Up Room"),
  },
  {
    name: "Hot Take Arena",
    route: "/games/hot-take-arena",
    storageKey: "hot-take-arena:lastSession",
    create: (page, name) => createSharedRoom(page, name, "Create Hot Take Room"),
  },
  {
    name: "Pressure Button",
    route: "/games/pressure-button",
    storageKey: "pressure-button:lastSession",
    create: (page, name) => createSharedRoom(page, name, "Create Pressure Room"),
  },
  {
    name: "Codenames",
    route: "/games/codenames",
    storageKey: "codenames:lastSession",
    create: (page, name) => createCardRoom(page, name, "Create Game"),
  },
  {
    name: "Poker",
    route: "/games/poker",
    storageKey: "poker:lastSession",
    create: (page, name) => createCardRoom(page, name, "Create Table"),
  },
  {
    name: "Mafia",
    route: "/games/mafia",
    storageKey: "mafia:lastSession",
    create: (page, name) => createCardRoom(page, name, "Create Village"),
  },
  {
    name: "Sudoku",
    route: "/games/sudoku",
    storageKey: "sudoku:lastSession",
    create: async (page, name) => {
      await page.locator('[data-slot="card-title"]', { hasText: "Multiplayer Race" }).click()
      await page.getByLabel("Your Name").fill(name)
      await page.getByRole("button", { name: "Create Game", exact: true }).click()
    },
  },
  {
    name: "Wordle",
    route: "/games/wordle",
    storageKey: "wordle:lastSession",
    create: async (page, name) => {
      await page.locator('[data-slot="card-title"]', { hasText: "Multiplayer" }).click()
      await page.locator('[data-slot="card-title"]', { hasText: "Create Game" }).click()
      await page.getByLabel("Your Name").fill(name)
      await page.getByRole("button", { name: "Create Game", exact: true }).click()
    },
  },
]

for (const game of games) {
  test(`${game.name} restores its lobby after reload`, async ({ page }) => {
    const playerName = `Reload ${game.name}`
    await page.goto(game.route)
    await page.waitForLoadState("networkidle")
    await game.create(page, playerName)

    await expect.poll(async () => page.evaluate((key) => {
      const raw = sessionStorage.getItem(key)
      return raw ? (JSON.parse(raw) as StoredSession).roomCode : null
    }, game.storageKey)).toMatch(/^[A-Z2-9]{6}$/)

    const session = await page.evaluate((key) => {
      return JSON.parse(sessionStorage.getItem(key)!) as StoredSession
    }, game.storageKey)

    await expect(page.getByText(session.roomCode, { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByText(session.roomCode, { exact: true })).toBeVisible()
    await expect(page.getByText(session.name, { exact: false }).first()).toBeVisible()
  })
}

test("Type Race reconnects after network loss and removes explicit leaves", async ({
  browser,
  page: hostPage,
}) => {
  let guestContext = await browser.newContext()
  let guestPage = await guestContext.newPage()

  try {
    await hostPage.goto("/games/typerace")
    await hostPage.waitForLoadState("networkidle")
    await createSharedRoom(hostPage, "Reconnect Host", "Create Type Race Room")

    await expect.poll(async () => hostPage.evaluate(() => {
      const raw = sessionStorage.getItem("typerace:lastSession")
      return raw ? (JSON.parse(raw) as StoredSession).roomCode : null
    })).toMatch(/^[A-Z2-9]{6}$/)
    const roomCode = await hostPage.evaluate(() => {
      return (JSON.parse(sessionStorage.getItem("typerace:lastSession")!) as StoredSession).roomCode
    })

    await guestPage.goto("/games/typerace")
    await guestPage.waitForLoadState("networkidle")
    await guestPage.getByPlaceholder("Your name").fill("Reconnect Guest")
    await guestPage.getByPlaceholder("Room code").fill(roomCode)
    await guestPage.getByRole("button", { name: "Join Room", exact: true }).click()

    await expect(hostPage.getByText("Reconnect Guest", { exact: true })).toBeVisible()
    const guestStorage = await guestPage.evaluate(() => Object.entries(sessionStorage))
    await guestContext.close()
    await expect(hostPage.getByText("reconnecting…", { exact: true })).toBeVisible()

    guestContext = await browser.newContext()
    await guestContext.addInitScript((entries) => {
      for (const [key, value] of entries) sessionStorage.setItem(key, value)
    }, guestStorage)
    guestPage = await guestContext.newPage()
    await guestPage.goto("/games/typerace")
    await expect(guestPage.getByText(roomCode, { exact: true })).toBeVisible()
    await expect(hostPage.getByText("reconnecting…", { exact: true })).toHaveCount(0)

    await guestPage.getByRole("button", { name: "Leave Lobby", exact: true }).click()
    await expect(hostPage.getByText("Reconnect Guest", { exact: true })).toHaveCount(0)
  } finally {
    await guestContext.close()
  }
})
