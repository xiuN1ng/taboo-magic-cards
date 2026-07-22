// endings.js — End-of-run endings
// Two-endings system: 通关 (cleared all 8 antes) vs 失败 (failed a blind)
// Style matches Balatro: simple win/lose split, no extra judgment

function determineEnding(state) {
  if (state.phase === 'win') {
    return {
      id: 'cleared',
      title: '通 关',
      subtitle: '八 关 皆 克',
      description: '你走完了八关。\n每一道禁忌都拦不住你。\n每一张禁卡都被你打出。\n\n最后一张牌落在桌上时,牌组合上书页。\n你听见一个很轻的声音说:\n「再 来 一 次?」',
      hue: 'cleared',
    };
  }
  return {
    id: 'failed',
    title: '失 败',
    subtitle: '你 在 第 ' + state.ante + ' 关 倒 下',
    description: '你的筹码不够。\n关卡的目标还差那么一点。\n你翻完了手牌,没有牌能救你。\n\n牌组合上。\n你可以再来一局,或者回主菜单。',
    hue: 'failed',
  };
}

window.Endings = {
  determineEnding,
};
