/**
 * security.js — Guard contra SSRF (SEC-05)
 *
 * Las integraciones/webhooks hacen que el servidor llame a una URL que el
 * propio usuario configura. Sin control, esa URL podría apuntar a un host
 * interno (localhost, la red privada del hosting, el endpoint de metadata
 * de la nube) y el servidor lo llamaría por él. assertPublicWebhookUrl()
 * resuelve el hostname y rechaza cualquier IP privada/loopback/link-local
 * antes de permitir el guardado o el fetch.
 */
const dns = require('dns').promises;

function isPrivateIPv4(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true; // malformado: por seguridad, no confiar
    const [a, b] = parts;
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 0) return true; // "esta red"
    if (a === 169 && b === 254) return true; // link-local (incluye metadata de nube: 169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    return false;
}

function isPrivateIPv6(ip) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true; // loopback
    if (lower.startsWith('fe80')) return true; // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local fc00::/7
    if (lower.startsWith('::ffff:')) return isPrivateIPv4(lower.split(':').pop()); // IPv4 mapeada
    return false;
}

/**
 * Lanza un error si la URL no es un endpoint público válido.
 * Se llama tanto al guardar la integración como justo antes de cada
 * fetch saliente, para cubrir el caso de que el DNS cambie después de
 * guardada (DNS rebinding).
 */
async function assertPublicWebhookUrl(rawUrl) {
    let parsed;
    try {
        parsed = new URL(String(rawUrl || ''));
    } catch {
        throw new Error('URL de integración inválida');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('La URL de integración debe usar http o https');
    }
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
        throw new Error('No se permite un endpoint local');
    }
    let addresses;
    try {
        addresses = await dns.lookup(hostname, { all: true });
    } catch {
        throw new Error('No se pudo resolver el host del endpoint');
    }
    if (!addresses.length) {
        throw new Error('No se pudo resolver el host del endpoint');
    }
    for (const { address, family } of addresses) {
        const isPrivate = family === 6 ? isPrivateIPv6(address) : isPrivateIPv4(address);
        if (isPrivate) {
            throw new Error('El endpoint resuelve a una dirección de red privada/interna, no permitido');
        }
    }
}

module.exports = { assertPublicWebhookUrl };
