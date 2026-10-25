import {api} from './api.js';

const LAST_KEY='pf2e-planner-last-campaign';
export function rememberCampaign(id){try{localStorage.setItem(LAST_KEY,id);}catch{}}
export function lastCampaign(){try{return localStorage.getItem(LAST_KEY);}catch{return null;}}

/** Current user and campaigns, sending signed-out visitors to sign-in. */
export async function requireSession(){
  try{return await api('/api/v1/me');}
  catch(error){
    if(error.status===401){location.replace('/sign-in');return new Promise(()=>{});}
    throw error;
  }
}
/** Everything the campaign screens' app bar needs. */
export async function loadCampaign(campaignId){
  const session=await requireSession();
  const campaign=session.campaigns.find(c=>c.id===campaignId);
  if(!campaign)throw Object.assign(Error('You’re not a member of this campaign.'),{status:403});
  rememberCampaign(campaignId);
  const sync=await api('/api/v1/campaigns/'+encodeURIComponent(campaignId)+'/catalog-summary').catch(()=>null);
  const isGm=session.user.siteRole==='owner'||campaign.role==='gm';
  return {me:session.user,campaigns:session.campaigns,campaign,sync,isGm};
}
