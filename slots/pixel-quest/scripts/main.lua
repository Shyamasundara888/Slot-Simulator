-- Combo e Boss Spin di Pixel Quest.
--
-- Nei free spin ogni spin vincente fa salire la combo, uno spin senza
-- vincita la azzera. Ogni volta che la combo arriva a 3 si sblocca un Boss
-- Spin. Finiti i free spin, i Boss Spin si giocano sui rulli "boss", con soli
-- personaggi e spade, e vincono sempre.

spinModes = { "free" }

local COMBO_FOR_BOSS = 3

function onSpin(spin)
  if spin.win > 0 then
    round.combo = (round.combo or 0) + 1
    if round.combo == COMBO_FOR_BOSS then
      round.boss = (round.boss or 0) + 1
      round.combo = 0
    end
  else
    round.combo = 0
  end
end

function onFeatureEnd(feature)
  if feature.mode == "free" and (round.boss or 0) > 0 then
    return { mode = "boss", spins = round.boss, guaranteeWin = true }
  end
end
