import { test, expect } from '@playwright/test';

async function join(page, url, name, devices = true) {
  await page.goto(url);
  await page.locator('#guest-name').fill(name);
  await page
    .getByRole('button', {
      name: devices ? 'Join meeting' : 'Join with camera and microphone off',
      exact: true,
    })
    .click();
  await expect(page.locator('.connection-pill')).toHaveClass(/online/);
}

async function remoteFrames(page, name) {
  const tile = page
    .locator('.video-tile')
    .filter({ has: page.locator('.tile-label', { hasText: name }) });
  await expect(tile).toHaveAttribute('data-connection', 'connected');
  await expect
    .poll(() =>
      tile.locator('video').evaluate((video) => ({
        width: video.videoWidth,
        ready: video.readyState,
        time: video.currentTime,
      })),
    )
    .toMatchObject({ width: expect.any(Number) });
  await page.waitForFunction((name) => {
    const tile = [...document.querySelectorAll('.video-tile')].find(
      (tile) => tile.dataset.peer === name,
    );
    const video = tile?.querySelector('video');
    return (
      video &&
      video.videoWidth > 0 &&
      video.readyState >= 2 &&
      video.currentTime > 0
    );
  }, name);
}

async function pair(browser, baseURL) {
  const hostContext = await browser.newContext({
    permissions: ['camera', 'microphone', 'clipboard-read', 'clipboard-write'],
  });
  const guestContext = await browser.newContext({
    permissions: ['camera', 'microphone'],
  });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const url = baseURL + '/browser-check-' + crypto.randomUUID();
  await join(host, url, 'Host');
  await join(guest, url, 'Guest');
  await remoteFrames(host, 'Guest');
  await remoteFrames(guest, 'Host');
  return {
    host,
    guest,
    hostContext,
    guestContext,
    url,
    close: async () => {
      await hostContext.close();
      await guestContext.close();
    },
  };
}

test('create, invite, collaborate, enable devices later and leave', async ({
  browser,
  page,
  baseURL,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.locator('#room-name').fill('Study group');
  await page
    .getByRole('button', { name: 'Start meeting', exact: true })
    .click();
  await page.locator('#guest-name').fill('Anuj');
  await page.getByRole('button', { name: 'Join meeting', exact: true }).click();
  await expect(page.locator('.connection-pill')).toHaveClass(/online/);
  await page
    .getByRole('button', { name: 'Invite people', exact: true })
    .click();
  const url = await page.locator('#invite-url').inputValue();
  expect(new URL(url).origin).toBe(new URL(baseURL).origin);
  await page
    .getByRole('button', { name: 'Copy meeting link', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Link copied', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close invitation' }).click();
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    permissions: ['camera', 'microphone'],
  });
  const guest = await mobile.newPage();
  try {
    await join(guest, url, 'Maya', false);
    await remoteFrames(guest, 'Anuj');
    await guest
      .getByRole('button', { name: 'Start camera', exact: true })
      .click();
    await remoteFrames(page, 'Maya');
    await page.getByRole('button', { name: 'Open chat', exact: true }).click();
    await page.locator('#message').fill('<b>Study starts at five</b>');
    await page.getByRole('button', { name: 'Send message' }).click();
    await guest.getByRole('button', { name: 'Open chat', exact: true }).click();
    await expect(
      guest.getByText('<b>Study starts at five</b>', { exact: true }),
    ).toBeVisible();
    expect(await guest.locator('.chat-message b').count()).toBe(0);
    await page.getByRole('button', { name: 'Raise hand', exact: true }).click();
    await expect(
      guest.locator('[data-peer="Anuj"] .raised-hand'),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Mute microphone', exact: true })
      .click();
    expect(
      await page
        .locator('[data-peer="self"] video')
        .evaluate((video) => video.srcObject.getAudioTracks()[0].enabled),
    ).toBe(false);
    await page
      .getByRole('button', { name: 'Stop camera', exact: true })
      .click();
    await expect(guest.locator('[data-peer="Anuj"] video')).toHaveClass(
      /video-hidden/,
    );
    await page
      .getByRole('button', { name: 'Participants, 2 people', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Your people' }),
    ).toBeVisible();
    await expect(page.locator('.people-list')).toContainText('Anuj (you)');
    await expect(page.locator('.people-list')).toContainText('Maya');
    expect(
      await guest.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await guest
      .getByRole('button', { name: 'Leave meeting', exact: true })
      .click();
    await expect(
      guest.getByRole('heading', { name: 'Good to see you.' }),
    ).toBeVisible();
    await expect(page.locator('.video-grid')).toHaveAttribute(
      'data-count',
      '1',
    );
    await guest.getByRole('button', { name: 'Back to home' }).click();
    await expect(
      guest.getByRole('heading', { name: 'Good conversations start here.' }),
    ).toBeVisible();
    await expect(
      guest.getByRole('button', { name: /Study group/ }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await mobile.close();
  }
});

test('screen sharing reaches the other browser and returns to the camera', async ({
  browser,
  baseURL,
}) => {
  const room = await pair(browser, baseURL);
  try {
    await room.host
      .getByRole('button', { name: 'Share screen', exact: true })
      .click();
    await expect(
      room.host.getByRole('button', {
        name: 'Stop sharing screen',
        exact: true,
      }),
    ).toBeVisible();
    await expect(room.guest.locator('[data-peer="Host"]')).toHaveClass(
      /screen-tile/,
    );
    await remoteFrames(room.guest, 'Host');
    await room.host
      .getByRole('button', { name: 'Stop sharing screen', exact: true })
      .click();
    await expect(room.guest.locator('[data-peer="Host"]')).not.toHaveClass(
      /screen-tile/,
    );
    await remoteFrames(room.guest, 'Host');
    await room.host
      .getByRole('button', { name: 'Stop camera', exact: true })
      .click();
    await room.host
      .getByRole('button', { name: 'Share screen', exact: true })
      .click();
    await expect(room.guest.locator('[data-peer="Host"]')).toHaveClass(
      /screen-tile/,
    );
    await expect(
      room.guest.locator('[data-peer="Host"] video'),
    ).not.toHaveClass(/video-hidden/);
    await room.host
      .getByRole('button', { name: 'Stop sharing screen', exact: true })
      .click();
    await expect(room.guest.locator('[data-peer="Host"] video')).toHaveClass(
      /video-hidden/,
    );
  } finally {
    await room.close();
  }
});

test('media permission failure offers device-free joining and validates the name', async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Permission denied', 'NotAllowedError');
    };
  });
  await page.goto('/permission-check-' + crypto.randomUUID());
  await page.getByRole('button', { name: 'Join meeting', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Enter your name');
  await page.locator('#guest-name').fill('Guest');
  await page.getByRole('button', { name: 'Join meeting', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'permission was declined',
  );
  await page
    .getByRole('button', {
      name: 'Join with camera and microphone off',
      exact: true,
    })
    .click();
  await expect(page.locator('.connection-pill')).toHaveClass(/online/);
});

test('a dropped network recovers room signaling and chat', async ({
  browser,
  baseURL,
}) => {
  const room = await pair(browser, baseURL);
  try {
    await room.guestContext.setOffline(true);
    await expect(room.guest.locator('.connection-pill')).toContainText(
      'Reconnecting',
      { timeout: 40000 },
    );
    await room.guestContext.setOffline(false);
    await expect(room.guest.locator('.connection-pill')).toHaveClass(/online/, {
      timeout: 25000,
    });
    await expect(room.host.locator('.video-grid')).toHaveAttribute(
      'data-count',
      '2',
    );
    await room.guest
      .getByRole('button', { name: 'Open chat', exact: true })
      .click();
    await room.guest.locator('#message').fill('Back after the network dropped');
    await room.guest.getByRole('button', { name: 'Send message' }).click();
    await room.host
      .getByRole('button', { name: 'Open chat', exact: true })
      .click();
    await expect(
      room.host.getByText('Back after the network dropped'),
    ).toBeVisible();
  } finally {
    await room.close();
  }
});
