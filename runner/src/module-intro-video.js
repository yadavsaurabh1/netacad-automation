/*
    netacad-automation
    Copyright (C) 2026 Saurabh Kumar Yadav

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { deepQuerySelectorAll } from './dom.js';

function isFullscreenBrightcovePlayer(player, win) {
    if (!player) return false;
    const vh = win.innerHeight || 800;
    const rect = player.getBoundingClientRect();
    if (rect.height >= vh * 0.45) return true;
    const style = player.getAttribute('style') || '';
    return /100vh/i.test(style);
}

function findModuleIntroVideo(doc, content, win) {
    for (const holder of deepQuerySelectorAll('.brightcove-video-holder', doc)) {
        if (!content.isElementSubstantiallyVisible(holder, 0.15)) continue;

        const player = holder.querySelector('.video-js');
        const video = holder.querySelector('video');
        if (!video) continue;

        const dialog = holder.closest('[role="dialog"], .notify__popup, .modal, .overlay');
        if (dialog || isFullscreenBrightcovePlayer(player, win)) {
            return { holder, player, video, dialog };
        }
    }
    return null;
}

function videoIsFinished(video) {
    if (!video) return false;
    if (video.ended) return true;
    return video.duration > 0 && !isNaN(video.duration) &&
        video.currentTime >= Math.max(0, video.duration - 0.5);
}

function skipIntroVideo(video, player, runtime) {
    runtime.isPaused = true;
    runtime.isVideoActive = true;

    const release = () => {
        runtime.isPaused = false;
        runtime.isVideoActive = false;
    };

    const failsafe = setTimeout(release, 12000);
    video.muted = true;

    const doSkip = () => {
        video.currentTime = (video.duration && !isNaN(video.duration))
            ? Math.max(0, video.duration - 0.5)
            : 99999;
        video.addEventListener('ended', () => {
            clearTimeout(failsafe);
            release();
        }, { once: true });
    };

    const performSkip = () => {
        setTimeout(() => {
            if (!isNaN(video.duration) && video.duration > 0) doSkip();
            else {
                video.addEventListener('loadedmetadata', doSkip, { once: true });
                setTimeout(doSkip, 1500);
            }
        }, 300);
    };

    if (!video.paused && video.currentTime > 0) {
        performSkip();
        return;
    }

    video.addEventListener('play', performSkip, { once: true });

    const bigPlayBtn = player?.querySelector(
        '.vjs-big-play-button, .play-button, button[aria-label="Play"], button[title="Play Video"]',
    );
    if (bigPlayBtn && bigPlayBtn.offsetParent !== null) {
        setTimeout(() => bigPlayBtn.click(), 200);
    }

    setTimeout(() => {
        if (video.paused) {
            const playPromise = video.play();
            if (playPromise !== undefined) playPromise.catch(() => {});
        }
    }, 600);
}

function tryDismissIntro(doc, content, intro) {
    const roots = [intro.dialog, intro.holder?.parentElement, intro.holder].filter(Boolean);
    const inScope = (el) => roots.some(root => root.contains(el));

    const dismissSelectors = [
        'button.js-notify-close-btn',
        'button.close-button',
        'button.close-btn',
        'button[aria-label*="Close"]',
        'button.vjs-close-button',
    ];

    for (const sel of dismissSelectors) {
        const btn = deepQuerySelectorAll(sel, doc)
            .find(b => !b.disabled &&
                !b.classList.contains('disabled') &&
                inScope(b) &&
                content.isElementSubstantiallyVisible(b, 0.05));
        if (btn) {
            btn.click();
            return true;
        }
    }

    const textBtn = deepQuerySelectorAll('button', doc)
        .find(b => !b.disabled &&
            !b.classList.contains('disabled') &&
            inScope(b) &&
            content.isElementSubstantiallyVisible(b, 0.05) &&
            /^(continue|next|close|skip|got it|start)$/i.test((b.textContent || '').trim()));
    if (textBtn) {
        textBtn.click();
        return true;
    }

    return false;
}

export function tryHandleModuleIntroVideo(doc, content, win, runtime, processedVideos) {
    const intro = findModuleIntroVideo(doc, content, win);
    if (!intro) return false;

    if (processedVideos?.has(intro.video)) return false;

    if (!videoIsFinished(intro.video)) {
        if (!intro.video.dataset.introSkipStarted) {
            intro.video.dataset.introSkipStarted = 'true';
            processedVideos?.add(intro.video);
            skipIntroVideo(intro.video, intro.player, runtime);
        }
        return true;
    }

    processedVideos?.add(intro.video);
    if (tryDismissIntro(doc, content, intro)) return true;

    return true;
}
