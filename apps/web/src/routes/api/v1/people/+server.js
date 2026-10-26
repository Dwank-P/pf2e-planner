import {db} from '#lib/server/db.js';
import {sessionUser,problem,respond,throttle} from '#lib/server/api.js';

/** Find active accounts to share a personal character with: ?q= (2+ characters of a name or username). */
export function GET(event){
  const user=sessionUser(event);
  throttle(event,'people-search',120,600);
  const q=String(event.url.searchParams.get('q')||'').trim().toLowerCase();
  if(q.length<2||q.length>60)problem(400,'search_needs_two_characters');
  const like=q.replace(/[\\%_]/g,m=>'\\'+m)+'%';
  const people=db().prepare(`SELECT id,display_name AS displayName,username FROM users
    WHERE status='active' AND id<>? AND (LOWER(username) LIKE ? ESCAPE '\\' OR LOWER(display_name) LIKE ? ESCAPE '\\')
    ORDER BY display_name LIMIT 8`).all(user.id,like,like);
  return respond({people});
}
