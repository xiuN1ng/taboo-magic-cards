// endings.js — End-of-run endings
// Based on 戒断值 (corruption value): violations + forbidden cards played + button presses

function determineEnding(state) {
  const corrupt = state.corrupt;
  if (corrupt <= 3) {
    return {
      id: 'pure',
      title: '清 白 结 局',
      subtitle: '你 没 有 沦 陷',
      description: '你听从了那个声音的警告。\n你按捺住了每一次按下的冲动。\n你看着那道红光闪烁,然后转身离开。\n\n这个世界是安全的。\n因为你选择了安全。',
      hue: 'pure',
    };
  } else if (corrupt <= 10) {
    return {
      id: 'balanced',
      title: '平 衡 结 局',
      subtitle: '在 边 缘 游 走',
      description: '有些禁忌你打破了。\n有些禁令你遵守了。\n你的指尖留下了一些红印。\n但你仍然是自己。\n\n你学会了与诱惑共处。\n也许这就是人类的常态。',
      hue: 'balanced',
    };
  } else {
    return {
      id: 'corrupted',
      title: '沉 沦 结 局',
      subtitle: '你 听 见 了 那 个 声 音',
      description: '你按下了那个键。\n不止一次。\n\n你看见了不应该看见的东西。\n你做了不应该做的事。\n你获得了不应该获得的分数。\n\n但你输了。\n你输给了自己。\n\n那个声音现在在你耳边低语。\n它说:「再 来 一 次?」',
      hue: 'corrupted',
    };
  }
}

window.Endings = {
  determineEnding,
};
