// ===== PROFILE PAGE =====

async function handleProfileUpdate(event) {
    event.preventDefault();
    const username = document.getElementById('profileUser').value.trim();
    const email = document.getElementById('profileEmail').value.trim();

    if (!username || username.length < 3) {
        return showToast('⚠️', 'Username must be at least 3 characters');
    }

    try {
        const data = await api('/profile', {
            method: 'PUT',
            body: JSON.stringify({ username, email })
        });
        currentUser.username = data.user.username;
        currentUser.email = data.user.email;
        updateNavUser();
        showToast('✅', 'Profile updated successfully');
    } catch (err) {
        showToast('❌', err.message);
    }
}

function handleLogout() {
    logout();
    navigateTo('dashboard');
}

const LEVEL_BADGES = ['🌱', '🌿', '🌳', '🏕️', '🌲', '🏔️', '🌍', '🌟', '💎', '👑'];

async function loadProfileData() {
    if (!token) return;

    try {
        const [meData, statsData] = await Promise.all([
            api('/me'),
            api('/stats').catch(() => null)
        ]);

        const user = meData.user;

        // Populate form fields
        document.getElementById('profileUser').value = user.username || '';
        document.getElementById('profileEmail').value = user.email || '';

        // Total impact
        if (statsData && statsData.totals) {
            const saved = statsData.totals.co2_saved_kg || 0;
            const impactEl = document.getElementById('profileTotalImpact');
            impactEl.textContent = fmtNum(saved) + 'kg';
            impactEl.className = 'stat-card-value ' + (saved < 0 ? 'red' : 'green');
            const impactSub = impactEl.nextElementSibling;
            if (impactSub) impactSub.textContent = saved < 0 ? 'try greener transport to recover' : 'CO2 Saved Overall';

            // Stats list
            document.getElementById('pStatTrees').textContent = fmtNum(saved / 21);
            document.getElementById('pStatCalories').textContent = fmtNum(statsData.totals.calories_burned || 0, 0) + ' kcal';
            document.getElementById('pStatDistance').textContent = fmtNum(statsData.totals.distance_km || 0) + ' km';
            document.getElementById('pStatTravelTime').textContent = formatTravelTime(statsData.totals.travel_time_min || 0);
        }

        // Sustainability score
        if (statsData && statsData.sustainability_score != null) {
            document.getElementById('profileSustainability').textContent = statsData.sustainability_score;
        }

        // Streak
        if (statsData && statsData.user) {
            document.getElementById('pStatStreak').textContent = (statsData.user.current_streak || 0) + ' days';
            document.getElementById('pStatLongestStreak').textContent = (statsData.user.longest_streak || 0) + ' days';
        }

        // XP / Level card
        if (statsData && statsData.user) {
            const u = statsData.user;
            const levelName = u.level_name || 'Sprout';
            const level = u.level || 1;
            const badge = LEVEL_BADGES[Math.min(level - 1, LEVEL_BADGES.length - 1)];
            const levelFloor = u.xp_current_level || 0;
            const levelCeil = u.xp_next_level || 100;
            const xpInLevel = (u.xp || 0) - levelFloor;
            const xpNeeded = levelCeil - levelFloor;
            const xpToNext = u.xp_to_next != null ? u.xp_to_next : Math.max(0, levelCeil - (u.xp || 0));
            const xpProgress = xpNeeded > 0 ? Math.min(100, (xpInLevel / xpNeeded) * 100) : 100;

            document.getElementById('profileLevelBadge').textContent = badge;
            document.getElementById('profileLevelName').textContent = `${levelName} — Lvl ${level}`;
            document.getElementById('profileLevelXp').textContent = `${xpInLevel} / ${xpNeeded} XP`;
            document.getElementById('profileXpFill').style.width = xpProgress + '%';
            document.getElementById('profileXpNext').textContent = `${xpToNext} XP to next level`;
        }

        // Community rank from leaderboard
        try {
            const lbData = await api('/leaderboard?type=co2&period=all');
            const myEntry = lbData.entries.find(e => e.isCurrentUser);
            document.getElementById('profileRank').textContent = myEntry ? `#${myEntry.rank}` : '#—';
        } catch {
            document.getElementById('profileRank').textContent = '#—';
        }

        // Account age and member since
        if (user.created_at) {
            const created = new Date(user.created_at);
            const now = new Date();
            const diffDays = Math.floor((now - created) / (1000 * 60 * 60 * 24));
            let ageText;
            if (diffDays < 1) ageText = '<1d';
            else if (diffDays < 30) ageText = diffDays + 'd';
            else if (diffDays < 365) ageText = Math.floor(diffDays / 30) + 'mo';
            else ageText = Math.floor(diffDays / 365) + 'y';
            document.getElementById('profileAge').textContent = ageText;
            document.getElementById('profileMemberSince').textContent = created.getFullYear();
        }

        // Daily challenges
        if (statsData && statsData.daily_challenges && statsData.daily_challenges.length > 0) {
            const card = document.getElementById('profileChallengesCard');
            card.style.display = '';
            const list = document.getElementById('profileChallengesList');
            list.innerHTML = statsData.daily_challenges.map(ch => `
                <div class="challenge-item ${ch.completed ? 'completed' : ''}">
                    <span class="challenge-check">${ch.completed ? '✅' : '⬜'}</span>
                    <div class="challenge-info">
                        <span class="challenge-desc">${escapeHtml(ch.desc)}</span>
                        <span class="challenge-xp">+${ch.xp} XP</span>
                    </div>
                </div>
            `).join('');
        }

        // Achievements
        if (statsData && statsData.achievements && statsData.achievements.length > 0) {
            const card = document.getElementById('profileAchievementsCard');
            card.style.display = '';
            const grid = document.getElementById('profileAchievementsGrid');
            grid.innerHTML = statsData.achievements.map(ach => {
                const isUnlocked = ach.unlocked;
                const icon = isUnlocked ? (ach.icon || '🏆') : '🔒';
                const unlockedDate = isUnlocked && ach.unlocked_at
                    ? new Date(ach.unlocked_at).toLocaleDateString()
                    : '';
                return `
                <div class="achievement-item ${isUnlocked ? 'unlocked' : 'locked'}">
                    <span class="achievement-icon">${icon}</span>
                    <div class="achievement-name">${escapeHtml(ach.name)}</div>
                    <div class="achievement-desc">${escapeHtml(ach.desc || '')}</div>
                    ${unlockedDate ? `<div class="achievement-date">${unlockedDate}</div>` : ''}
                </div>`;
            }).join('');
        }

    } catch (err) {
        console.error('Failed to load profile data:', err);
    }
}

function formatTravelTime(minutes) {
    if (!minutes || minutes <= 0) return '0 min';
    if (minutes < 60) return Math.round(minutes) + ' min';
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
