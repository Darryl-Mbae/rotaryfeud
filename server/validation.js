// Sanitize a string: strip HTML tags, trim, limit length
function sanitizeString(str, maxLen = 50) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>/g, '')   // strip HTML tags
    .replace(/[&<>"'`]/g, c => ({ // escape remaining special chars
      '&': '&amp;', '<': '&lt;', '>': '&gt;',
      '"': '&quot;', "'": '&#x27;', '`': '&#x60;'
    }[c]))
    .trim()
    .slice(0, maxLen);
}

const VALID_ACTIONS = new Set([
  'START_TOURNAMENT', 'FLIP_CARD', 'WRONG', 'NEXT_QUESTION',
  'AWARD_TEAM', 'PROCEED_TO_SEMIFINAL', 'RESTART'
]);

// Host-only actions — require authenticated socket
const HOST_ONLY_ACTIONS = new Set([
  'START_TOURNAMENT', 'FLIP_CARD', 'WRONG', 'NEXT_QUESTION',
  'AWARD_TEAM', 'PROCEED_TO_SEMIFINAL', 'RESTART'
]);

function validateAction(action) {
  if (!action || typeof action !== 'object') {
    return { valid: false, error: 'Action must be an object' };
  }
  if (!VALID_ACTIONS.has(action.type)) {
    return { valid: false, error: `Unknown action type: ${action.type}` };
  }

  switch (action.type) {
    case 'START_TOURNAMENT': {
      if (!Array.isArray(action.teams) || action.teams.length !== 6) {
        return { valid: false, error: 'START_TOURNAMENT requires exactly 6 teams' };
      }
      // Sanitize team names in-place
      action.teams = action.teams.map(t => sanitizeString(t, 30) || `Team`);
      break;
    }
    case 'FLIP_CARD': {
      const idx = action.cardIndex;
      if (typeof idx !== 'number' || idx < 0 || idx > 9 || !Number.isInteger(idx)) {
        return { valid: false, error: 'FLIP_CARD requires cardIndex 0-9' };
      }
      if (action.boardScore !== undefined && (typeof action.boardScore !== 'number' || action.boardScore < 0)) {
        return { valid: false, error: 'Invalid boardScore' };
      }
      break;
    }
    case 'AWARD_TEAM': {
      const { teamNum, points } = action;
      if (teamNum !== 1 && teamNum !== 2) {
        return { valid: false, error: 'AWARD_TEAM requires teamNum 1 or 2' };
      }
      if (typeof points !== 'number' || points < 0 || points > 10000) {
        return { valid: false, error: 'Invalid points value' };
      }
      break;
    }
  }

  return { valid: true };
}

module.exports = { validateAction, sanitizeString, HOST_ONLY_ACTIONS };
