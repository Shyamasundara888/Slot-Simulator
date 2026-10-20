-- Combo e Boss Spin di Pixel Quest.
--
-- Nei free spin ogni spin vincente allunga la combo, uno spin senza vincita
-- la azzera. Ogni 5 spin vincenti di fila si sblocca un Boss Spin. Finiti i
-- free spin, i Boss Spin si giocano sui rulli "boss", con soli personaggi e
-- spade, vincono sempre e hanno un moltiplicatore pari al doppio della combo
-- più lunga (×10 con una combo di 5, ×14 con una di 7).

spinModes = { "free" }

local COMBO_FOR_BOSS = 5

function onSpin(spin)
  if spin.win > 0 then
    round.combo = (round.combo or 0) + 1
    round.best = math.max(round.best or 0, round.combo)
    if round.combo % COMBO_FOR_BOSS == 0 then
      round.boss = (round.boss or 0) + 1
    end
  else
    round.combo = 0
  end
end

function onFeatureEnd(feature)
  if feature.mode == "free" and (round.boss or 0) > 0 then
    return { mode = "boss", spins = round.boss, guaranteeWin = true, multiplier = 2 * round.best }
  end
end
