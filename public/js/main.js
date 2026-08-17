function openCopilotDemo() {
            const t = document.getElementById('copilot-tooltip');
            const p = document.getElementById('copilot-text');
            if(t.style.display === 'none' || !t.style.display) {
                t.style.display = 'block';
                p.innerHTML = '';
                const msg = "¡Hola! He detectado 30 tareas completadas hoy. ¿Quieres que prepare un reporte para el cliente?";
                let i = 0;
                const typing = setInterval(() => {
                    p.innerHTML += msg.charAt(i);
                    i++;
                    if(i >= msg.length) clearInterval(typing);
                }, 40);
            } else {
                t.style.display = 'none';
            }
        }

        function showToast(msg) {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = 'toast-custom';
            toast.innerHTML = `<svg width="20" height="20" fill="none" stroke="#10b981" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> <span>${msg}</span>`;
            container.appendChild(toast);
            setTimeout(() => { toast.classList.add('hide-toast'); setTimeout(() => toast.remove(), 300); }, 3000);
        }

        // Intercept logActivity to also show Toast notification
        document.addEventListener('DOMContentLoaded', () => {
            const originalLog = window.logActivity;
            window.logActivity = function(title, desc) {
                showToast(title);
                if(originalLog) originalLog(title, desc);
            };
        });