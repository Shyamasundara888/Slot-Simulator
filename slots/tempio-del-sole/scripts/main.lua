-- Gold Spins del Tempio del Sole.
--
-- Durante i free spin ogni wild espanso può essere d'oro (1 su 5): ogni wild
-- d'oro mette da parte un Gold Spin. Finiti i free spin, i Gold Spin si
-- giocano sui rulli "gold", con soli simboli alti, vincono sempre e tengono
-- il moltiplicatore raggiunto nei free spin.

-- Chiama onSpin solo durante i free spin: negli altri spin non serve.
spinModes = { "free" }

local GOLD_CHANCE = 5 -- un wild espanso su 5 è d'oro

function onSpin(spin)
  for _ = 1, spin.wilds do
    if math.random(GOLD_CHANCE) == 1 then
      round.gold = (round.gold or 0) + 1
    end
  end
end

function onFeatureEnd(feature)
  if feature.mode == "free" and (round.gold or 0) > 0 then
    return { mode = "gold", spins = round.gold, guaranteeWin = true, multiplier = feature.multiplier }
  end
end
