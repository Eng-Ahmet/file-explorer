/**
 * common.js - Shared UI Logic for Hwai Technology Platform
 */

document.addEventListener('DOMContentLoaded', () => {
    initCommon();
});

function initCommon() {
    setupMobileMenu();
    updateHeaderUser();
}

function setupMobileMenu() {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const closeMenuBtn = document.getElementById('closeMenuBtn');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebar = document.getElementById('sidebar');

    if (!mobileMenuBtn || !sidebar) return;

    const toggleSidebar = (show) => {
        if (show) {
            sidebar.classList.remove('-translate-x-full');
            if (sidebarOverlay) {
                sidebarOverlay.classList.remove('hidden');
                setTimeout(() => sidebarOverlay.classList.remove('opacity-0'), 10);
            }
            document.body.classList.add('overflow-hidden');
        } else {
            sidebar.classList.add('-translate-x-full');
            if (sidebarOverlay) {
                sidebarOverlay.classList.add('opacity-0');
                setTimeout(() => sidebarOverlay.classList.add('hidden'), 300);
            }
            document.body.classList.remove('overflow-hidden');
        }
    };

    mobileMenuBtn.addEventListener('click', () => toggleSidebar(true));
    if (closeMenuBtn) closeMenuBtn.addEventListener('click', () => toggleSidebar(false));
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', () => toggleSidebar(false));
}

function updateHeaderUser() {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) return;

    try {
        const user = JSON.parse(storedUser);
        const nameEl = document.getElementById('userName');
        const roleEl = document.getElementById('userRole');

        if (nameEl) nameEl.textContent = user.username || user.email;
        if (roleEl) roleEl.textContent = user.role || 'User';

        renderNavigation(user.role);
    } catch (e) {
        console.error('Failed to parse user session', e);
    }
}

function renderNavigation(role) {
    const nav = document.getElementById('mainNav');
    if (!nav) return;

    const currentPath = window.location.pathname;

    const adminLinks = [
        { href: '/admin', id: 'navAdmin', label: 'Dashboard', icon: 'fa-tachometer-alt' },
        { href: '/admin/projects', id: 'navAdminProjects', label: 'Projects', icon: 'fa-project-diagram' },
        { href: '/projects', id: 'navProjects', label: 'Intelligence', icon: 'fa-microchip' },
        { href: '/files', id: 'navExplorer', label: 'Explorer', icon: 'fa-folder-closed' }
    ];

    const userLinks = [
        { href: '/projects', id: 'navProjects', label: 'Intelligence', icon: 'fa-microchip' },
        { href: '/files', id: 'navExplorer', label: 'Explorer', icon: 'fa-folder-closed' }
    ];

    const links = role === 'admin' ? adminLinks : userLinks;

    nav.innerHTML = links.map(link => `
        <a href="${link.href}" id="${link.id}" class="nav-btn ${currentPath === link.href ? 'active' : ''} flex items-center justify-center">
            <i class="fas ${link.icon} lg:mr-2.5 opacity-60"></i>
            <span class="hidden lg:inline text-[9px] uppercase tracking-wider">${link.label}</span>
        </a>
    `).join('');

    // Responsive positioning: Stay in header on mobile but visible
    nav.classList.remove('hidden');
    nav.classList.add('flex', 'items-center', 'gap-1', 'md:gap-3');
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}

function showToast(message, type = 'brand') {
    const toast = document.getElementById('toast');
    if (!toast) {
        console.warn('Toast element not found');
        return;
    }

    const icon = document.getElementById('toastIcon');
    const msg = document.getElementById('toastMessage');

    const themes = {
        brand: { bg: 'bg-tech-blue/20', text: 'text-tech-blue', icon: 'fa-info-circle' },
        success: { bg: 'bg-emerald-500/20', text: 'text-emerald-500', icon: 'fa-check-circle' },
        error: { bg: 'bg-rose-500/20', text: 'text-rose-500', icon: 'fa-exclamation-triangle' },
        info: { bg: 'bg-indigo-500/20', text: 'text-indigo-500', icon: 'fa-info-circle' }
    };

    const theme = themes[type] || themes.brand;

    if (icon) {
        icon.className = `w-10 h-10 rounded-xl flex items-center justify-center ${theme.text} ${theme.bg} border border-white/5`;
        icon.innerHTML = `<i class="fas ${theme.icon} text-lg"></i>`;
    }

    if (msg) msg.textContent = message;

    toast.classList.remove('translate-y-20', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 4000);
}

// Make globally available
window.logout = logout;
