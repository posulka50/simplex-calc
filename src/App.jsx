import { useState } from 'react';

const SimplexCalculator = () => {
  const [numVars, setNumVars] = useState(2);
  const [numConstraints, setNumConstraints] = useState(2);
  const [objective, setObjective] = useState('max');
  const [coefficients, setCoefficients] = useState([3, 2]);
  const [constraints, setConstraints] = useState([
    { coeffs: [2, 1], type: '<=', rhs: 18 },
    { coeffs: [1, 2], type: '<=', rhs: 16 }
  ]);
  const [iterations, setIterations] = useState([]);
  const [solution, setSolution] = useState(null);
  const [tableData, setTableData] = useState(null);

  const solveSimplexMethod = () => {
    try {
      console.log('=== DEBUG: Initial Input Values ===');
      console.log('Objective type:', objective);
      console.log('Number of variables:', numVars);
      console.log('Objective coefficients:', coefficients);
      console.log('Constraints:', constraints);
      console.log('======================================');

      const result = solveSimplex(
        coefficients,
        constraints,
        objective,
        numVars
      );
      setIterations(result.iterations);
      setSolution(result.solution);
      setTableData({ objCoeffs: result.objCoeffs, objType: result.objType, numVars: result.nVars, cRow: result.cRow });
    } catch (error) {
      alert('Помилка: ' + error.message);
      setIterations([]);
      setSolution(null);
      setTableData(null);
    }
  };

  const solveSimplex = (objCoeffs, constrs, objType, nVars) => {
    const iterations = [];
    const M = 1000000;
    let transformations = [];

    // Normalize constraints with negative RHS values or problematic coefficients
    const normalizedConstraints = constrs.map((constraint, i) => {
      let newConstraint = { ...constraint };
      let needsTransformation = false;
      let reason = '';

      // Check for negative RHS
      if (constraint.rhs < 0) {
        newConstraint = {
          coeffs: constraint.coeffs.map(c => -c),
          type: constraint.type === '<=' ? '>=' : constraint.type === '>=' ? '<=' : '=',
          rhs: -constraint.rhs
        };
        needsTransformation = true;
        reason = 'Обмеження з від\'ємною правою частиною перетворено шляхом множення на -1';
      }
      // Check for constraints <= with negative leading coefficient (can cause degeneracy)
      else if (constraint.type === '<=' && constraint.coeffs.some(c => c < 0)) {
        // For constraints with negative coefficients that might cause pivot issues,
        // we could add additional slack handling, but let's keep the original constraint
        // The algorithm should handle this correctly with proper pivot selection
      }

      if (needsTransformation) {
        transformations.push({
          index: i + 1,
          original: `${constraint.coeffs.map((c, j) => `${c >= 0 && j > 0 ? '+' : ''}${c}x${j+1}`).join('')} ${constraint.type} ${constraint.rhs}`,
          transformed: `${newConstraint.coeffs.map((c, j) => `${c >= 0 && j > 0 ? '+' : ''}${c}x${j+1}`).join('')} ${newConstraint.type} ${newConstraint.rhs}`,
          reason: reason
        });
      }

      return newConstraint;
    });

    // Show variable transformations according to constraint types
    let standardFormTransformations = [];
    let currentVarIndex = nVars + 1;

    normalizedConstraints.forEach((c, i) => {
      let transformation = {
        index: i + 1,
        original: `${c.coeffs.map((coeff, j) => `${coeff >= 0 && j > 0 ? '+' : ''}${coeff}x${j+1}`).join('')} ${c.type} ${c.rhs}`,
        standardForm: '',
        variables: []
      };

      let standardCoeffs = [...c.coeffs];
      let standardFormStr = standardCoeffs.map((coeff, j) => `${coeff >= 0 && j > 0 ? '+' : ''}${coeff}x${j+1}`).join('');

      if (c.type === '<=') {
        transformation.standardForm = `${standardFormStr} + x${currentVarIndex} = ${c.rhs}`;
        transformation.variables.push(`x${currentVarIndex} - слек-змінна (≥ 0)`);
        currentVarIndex++;
      } else if (c.type === '>=') {
        transformation.standardForm = `${standardFormStr} - x${currentVarIndex} + x${currentVarIndex + 1} = ${c.rhs}`;
        transformation.variables.push(`x${currentVarIndex} - слек-змінна (≥ 0)`);
        transformation.variables.push(`x${currentVarIndex + 1} - штучна змінна (≥ 0)`);
        currentVarIndex += 2;
      } else { // c.type === '='
        transformation.standardForm = `${standardFormStr} + x${currentVarIndex} = ${c.rhs}`;
        transformation.variables.push(`x${currentVarIndex} - штучна змінна (≥ 0)`);
        currentVarIndex++;
      }

      standardFormTransformations.push(transformation);
    });
    
    // Create the initial "iteration" object to hold transformations
    const initialStep = {
        transformations,
        standardFormTransformations,
        iterationNum: -1 // Special marker for transformations
    };
    iterations.push(initialStep);

    // Generate and add the modified objective function string if needed
    const artificialVarsForDisplay = [];
    initialStep.standardFormTransformations.forEach(transform => {
        transform.variables.forEach(v => {
            if (v.includes('штучна')) { // 'artificial'
                const match = v.match(/x(\d+)/);
                if (match) {
                    artificialVarsForDisplay.push(match[0]); // e.g., "x4"
                }
            }
        });
    });

    if (artificialVarsForDisplay.length > 0) {
        let originalFunc = objCoeffs.map((c, i) => {
            if (c === 0) return '';
            let sign = c > 0 ? '+' : '-';
            let val = Math.abs(c);
            if (i > 0) {
                 return ` ${sign} ${val}x${i + 1}`;
            }
            return `${c}x${i + 1}`;
        }).join('').trim();

        let penaltyPart = artificialVarsForDisplay.join(' + ');
        let modifiedObjectiveString;

        if (objType === 'max') {
            modifiedObjectiveString = `F' = ${originalFunc} - M(${penaltyPart}) → max`;
        } else { // min
            modifiedObjectiveString = `F' = ${originalFunc} + M(${penaltyPart}) → min`;
        }
        initialStep.modifiedObjectiveString = modifiedObjectiveString;
    }

    
    let slackCount = 0;
    let artificialCount = 0;
    let slackVars = [];
    let artificialVars = [];

    normalizedConstraints.forEach((c, i) => {
      if (c.type === '<=') {
        slackVars.push(nVars + slackCount);
        slackCount++;
      } else if (c.type === '>=') {
        slackVars.push(nVars + slackCount);
        artificialVars.push(nVars + slackCount + 1);
        slackCount += 2;
      } else {
        artificialVars.push(nVars + slackCount);
        slackCount++;
      }
    });
    
    const totalVars = nVars + slackCount;
    
    let tableau = [];
    let basis = [];
    let cB = [];
    
    let currentSlackIdx = nVars + 1;

    normalizedConstraints.forEach((c, i) => {
      let row = new Array(totalVars + 1).fill(0);
      row[0] = c.rhs;

      for (let j = 0; j < nVars; j++) {
        row[j + 1] = c.coeffs[j];
      }

      if (c.type === '<=') {
        row[currentSlackIdx] = 1;
        basis.push(currentSlackIdx - 1); // індекс слек-змінної
        cB.push(0);
        currentSlackIdx++;
      } else if (c.type === '>=') {
        row[currentSlackIdx] = -1;      // surplus variable
        row[currentSlackIdx + 1] = 1;   // artificial variable
        basis.push(currentSlackIdx); // штучна змінна у стовпці currentSlackIdx + 1, індекс 0-based = currentSlackIdx
        cB.push(objType === 'max' ? -M : M); // For max: -M, for min: +M
        currentSlackIdx += 2;
      } else { // c.type === '='
        row[currentSlackIdx] = 1;
        basis.push(currentSlackIdx - 1); // індекс штучної змінної
        cB.push(objType === 'max' ? -M : M); // For max: -M, for min: +M
        currentSlackIdx++;
      }

      tableau.push(row);
    });
    
    let cRow = new Array(totalVars + 1).fill(0);
    for (let j = 0; j < nVars; j++) {
      cRow[j + 1] = objCoeffs[j]; // Use original coefficients since we now use z_j - c_j formula
    }
    
    if (artificialVars.length > 0) {
      for (let artVar of artificialVars) {
        cRow[artVar + 1] = objType === 'max' ? -M : M; // For max: -M, for min: +M
      }
    }

    let deltaRow = calculateDeltaRow(tableau, cRow, basis, cB, totalVars, M, objType);
    
    console.log('Initial tableau:');
    tableau.forEach((row, i) => {
      console.log(`Row ${i}:`, row);
    });
    console.log('Initial basis:', basis);
    console.log('Initial cB:', cB);
    console.log('Initial deltaRow:', deltaRow);

    iterations.push({
      tableau: JSON.parse(JSON.stringify(tableau)),
      deltaRow: [...deltaRow],
      basis: [...basis],
      cB: [...cB],
      iterationNum: 0
    });
    
    let iterCount = 0;
    const maxIter = 20;
    
    while (iterCount < maxIter) {
      iterCount++;
      
      let pivotCol = -1;

      // Check if we have artificial variables in basis (Phase I)
      let hasArtificialInBasis = basis.some(b => artificialVars.includes(b));

      // Check if we have Big M values in cB
      const hasBigM = cB.some(c => Math.abs(c) === M);

      if (objType === 'max') {
        let minDelta = 0;

        if (hasArtificialInBasis) {
          // Phase I: prioritize removing artificial variables
          // Look for most positive delta among non-artificial variables
          for (let j = 1; j < deltaRow.length; j++) {
            // Skip artificial variable columns for entering
            if (!artificialVars.includes(j - 1)) {
              if (deltaRow[j] > minDelta) {
                minDelta = deltaRow[j];
                pivotCol = j;
              }
            }
          }
        } else {
          // Phase II: normal optimization, avoid artificial variables
          for (let j = 1; j <= nVars; j++) {
            if (hasBigM) {
              // For Big M with z_j - c_j formula, look for positive values
              if (deltaRow[j] > minDelta) {
                minDelta = deltaRow[j];
                pivotCol = j;
              }
            } else {
              // For standard c_j - z_j formula, look for negative values
              if (deltaRow[j] < minDelta) {
                minDelta = deltaRow[j];
                pivotCol = j;
              }
            }
          }
          // If no suitable non-artificial variable found, check slack variables
          if (pivotCol === -1) {
            for (let j = nVars + 1; j < deltaRow.length; j++) {
              if (!artificialVars.includes(j - 1)) {
                if (hasBigM) {
                  if (deltaRow[j] > minDelta) {
                    minDelta = deltaRow[j];
                    pivotCol = j;
                  }
                } else {
                  if (deltaRow[j] < minDelta) {
                    minDelta = deltaRow[j];
                    pivotCol = j;
                  }
                }
              }
            }
          }
        }

        // For maximization with z_j - c_j: optimal when all deltas <= 0
        // minDelta is the most negative value, so if it's >= -tolerance, all deltas <= 0
        if (minDelta >= -0.0001) break;
      } else {
        let minDelta = 0;

        if (hasArtificialInBasis) {
          // Phase I: prioritize removing artificial variables - look for most positive delta
          for (let j = 1; j < deltaRow.length; j++) {
            // Skip artificial variables columns for entering
            if (!artificialVars.includes(j - 1)) {
              if (deltaRow[j] > minDelta) {
                minDelta = deltaRow[j];
                pivotCol = j;
              }
            }
          }
        } else {
          // Phase II: normal optimization for minimization - look for most positive delta
          // Check all variables except artificial ones
          for (let j = 1; j < deltaRow.length; j++) {
            // Skip artificial variables
            if (!artificialVars.includes(j - 1)) {
              if (deltaRow[j] > minDelta) {
                minDelta = deltaRow[j];
                pivotCol = j;
              }
            }
          }
        }

        // For minimization with z_j - c_j: optimal when all deltas <= 0
        // minDelta is the most positive value, so if it's <= tolerance, all deltas <= 0
        if (minDelta <= 0.0001) break;
      }
      
      if (pivotCol === -1) break;
      
      let pivotRow = -1;
      let minRatio = Infinity;
      console.log(`Pivot column ${pivotCol} values:`, tableau.map(row => row[pivotCol]));
      console.log(`RHS values:`, tableau.map(row => row[0]));

      for (let i = 0; i < tableau.length; i++) {
        if (tableau[i][pivotCol] > 0.0001) {
          let ratio = tableau[i][0] / tableau[i][pivotCol];
          console.log(`Row ${i}: ${tableau[i][0]} / ${tableau[i][pivotCol]} = ${ratio}`);
          if (ratio >= 0 && ratio < minRatio) {
            minRatio = ratio;
            pivotRow = i;
          }
        }
      }
      console.log(`Selected pivot row: ${pivotRow}`);


      if (pivotRow === -1) {
        // Check if we're dealing with artificial variables
        if (artificialVars.includes(pivotCol - 1)) {
          // If artificial variable cannot enter basis, the problem is infeasible
          throw new Error('Задача не має допустимих розв\'язків (область допустимих розв\'язків порожня)');
        } else {
          // Regular unbounded solution
          if (objType === 'max') {
            throw new Error('Необмежена цільова функція - функція максимізації може зростати до +∞. Область допустимих розв\'язків є необмеженою.');
          } else {
            throw new Error('Необмежена цільова функція - функція мінімізації може зменшуватися до -∞. Область допустимих розв\'язків є необмеженою.');
          }
        }
      }
      
      const pivotElement = tableau[pivotRow][pivotCol];
      for (let j = 0; j <= totalVars; j++) {
        tableau[pivotRow][j] /= pivotElement;
      }
      
      for (let i = 0; i < tableau.length; i++) {
        if (i !== pivotRow) {
          const factor = tableau[i][pivotCol];
          for (let j = 0; j <= totalVars; j++) {
            tableau[i][j] -= factor * tableau[pivotRow][j];
          }
        }
      }
      
      basis[pivotRow] = pivotCol - 1;
      cB[pivotRow] = cRow[pivotCol];
      
      deltaRow = calculateDeltaRow(tableau, cRow, basis, cB, totalVars, M, objType);
      
      iterations.push({
        tableau: JSON.parse(JSON.stringify(tableau)),
        deltaRow: [...deltaRow],
        basis: [...basis],
        cB: [...cB],
        iterationNum: iterCount,
        pivotRow,
        pivotCol
      });
    }
    
    const finalSolution = {
      variables: new Array(nVars).fill(0),
      objectiveValue: 0
    };
    
    for (let i = 0; i < basis.length; i++) {
      if (basis[i] < nVars) {
        finalSolution.variables[basis[i]] = tableau[i][0];
      }
    }

    // Check for artificial variables in final solution (infeasible)
    console.log('Final basis:', basis);
    console.log('Final tableau RHS:', tableau.map(row => row[0]));
    console.log('Artificial vars:', artificialVars);

    for (let i = 0; i < basis.length; i++) {
      if (artificialVars.includes(basis[i]) && tableau[i][0] > 0.001) {
        console.log(`Artificial variable ${basis[i]} has non-zero value ${tableau[i][0]}`);
        throw new Error('Задача не має допустимих розв\'язків (область допустимих розв\'язків порожня)');
      }
    }

    // Calculate objective function value correctly
    finalSolution.objectiveValue = deltaRow[0];

    return { iterations, solution: finalSolution, objCoeffs, objType, nVars, cRow };
  };

  const calculateDeltaRow = (tableau, cRow, _basis, cB, totalVars, _M = 1000000, _objType = 'max') => {
    const deltaRow = new Array(totalVars + 1).fill(0);

    // Z-value (objective function value)
    let z = 0;
    for (let i = 0; i < tableau.length; i++) {
      z += cB[i] * tableau[i][0];
    }
    deltaRow[0] = z;

    // Delta values for each column
    for (let j = 1; j <= totalVars; j++) {
      let zj = 0; // z_j value
      for (let i = 0; i < tableau.length; i++) {
        zj += cB[i] * tableau[i][j];
      }

      // Use z_j - c_j formula to match lecture PDF format
      // This gives negative values for entering variables in maximization
      deltaRow[j] = zj - cRow[j];
    }

    return deltaRow;
  };

  const formatNumber = (num) => {
    if (Math.abs(num) < 0.0001) return '0';

    const M = 1000000;

    // Check for Big M values and display them symbolically
    if (Math.abs(num) === M) {
      return num > 0 ? 'M' : '-M';
    }

    // Check for expressions involving M (including fractional forms)
    if (Math.abs(num) > M / 10) {
      // First check if this might be a fraction with M in numerator
      // Look for patterns like (16M-12)/5, (7M-24)/5
      const testDenoms = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20];

      for (let denom of testDenoms) {
        const numerator = num * denom;
        const mCoeff = Math.round(numerator / M);
        const remainder = numerator - (mCoeff * M);

        // Check if this gives us a clean M expression
        if (Math.abs(mCoeff) > 0 && Math.abs(remainder) < 50) {
          const remainderInt = Math.round(remainder);

          if (remainderInt === 0) {
            // Pure M fraction like 16M/5
            if (denom === 1) {
              return mCoeff === 1 ? 'M' : mCoeff === -1 ? '-M' : `${mCoeff}M`;
            } else {
              const coeffStr = mCoeff === 1 ? '' : mCoeff === -1 ? '-' : mCoeff.toString();
              return `${coeffStr}M/${denom}`;
            }
          } else {
            // M with remainder like (16M-12)/5
            const mPart = mCoeff === 1 ? 'M' : mCoeff === -1 ? '-M' : `${mCoeff}M`;
            const sign = remainderInt >= 0 ? '+' : '';

            if (denom === 1) {
              return `${mPart}${sign}${remainderInt}`;
            } else {
              return `(${mPart}${sign}${remainderInt})/${denom}`;
            }
          }
        }
      }

      // Fallback for simple M multiples
      const coefficient = Math.round(num / M);
      const remainder = num - (coefficient * M);

      if (Math.abs(remainder) < 0.001) {
        // Pure M multiple
        if (coefficient === 1) return 'M';
        if (coefficient === -1) return '-M';
        return `${coefficient}M`;
      } else if (Math.abs(remainder) < 1000) {
        // M plus/minus small number
        const sign = remainder >= 0 ? '+' : '';
        if (coefficient === 1) return `M${sign}${Math.round(remainder)}`;
        if (coefficient === -1) return `-M${sign}${Math.round(remainder)}`;
        return `${coefficient}M${sign}${Math.round(remainder)}`;
      }
    }

    if (Number.isInteger(num)) return num.toString();

    // Try to express as simple fraction
    const tolerance = 0.0001;
    for (let denominator = 1; denominator <= 20; denominator++) {
      const numerator = Math.round(num * denominator);
      if (Math.abs(num - numerator/denominator) < tolerance) {
        if (denominator === 1) return numerator.toString();
        return `${numerator}/${denominator}`;
      }
    }

    const rounded = Math.round(num * 1000) / 1000;
    return rounded.toString();
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <div style={{ 
        backgroundColor: 'white', 
        border: '1px solid #e5e7eb', 
        borderRadius: '8px', 
        padding: '20px',
        marginBottom: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        color: 'black'
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
          Калькулятор симплекс-методу
        </h1>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
              Тип задачі:
            </label>
            <select 
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
            >
              <option value="max">Максимізація</option>
              <option value="min">Мінімізація</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
              Кількість змінних:
            </label>
            <input
              type="number"
              min="2"
              max="5"
              value={numVars}
              onChange={(e) => {
                const n = parseInt(e.target.value);
                setNumVars(n);
                setCoefficients(new Array(n).fill(0));
                setConstraints(constraints.map(c => ({
                  ...c,
                  coeffs: new Array(n).fill(0)
                })));
              }}
              style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
              Кількість обмежень:
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={numConstraints}
              onChange={(e) => {
                const n = parseInt(e.target.value);
                if (n > 0) {
                  setNumConstraints(n);
                  const newConstraints = [...constraints];
                  while (newConstraints.length < n) {
                    newConstraints.push({ coeffs: new Array(numVars).fill(0), type: '<=', rhs: 0 });
                  }
                  while (newConstraints.length > n) {
                    newConstraints.pop();
                  }
                  setConstraints(newConstraints);
                }
              }}
              style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
            Цільова функція: F = {coefficients.map((c, i) => 
              `${i > 0 ? (c >= 0 ? '+' : '') : ''}${c}x${i+1}`
            ).join('')}
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {coefficients.map((c, i) => (
              <input
                key={i}
                type="number"
                value={c}
                onChange={(e) => {
                  const newCoeffs = [...coefficients];
                  newCoeffs[i] = parseFloat(e.target.value) || 0;
                  setCoefficients(newCoeffs);
                }}
                placeholder={`c${i+1}`}
                style={{ width: '80px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
              />
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <label style={{ fontSize: '14px', fontWeight: '500' }}>
              Обмеження:
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  const newConstraints = [...constraints, { coeffs: new Array(numVars).fill(0), type: '<=', rhs: 0 }];
                  setConstraints(newConstraints);
                  setNumConstraints(newConstraints.length);
                }}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                + Додати
              </button>
              {constraints.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const newConstraints = constraints.slice(0, -1);
                    setConstraints(newConstraints);
                    setNumConstraints(newConstraints.length);
                  }}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  - Видалити
                </button>
              )}
            </div>
          </div>
          {constraints.map((constraint, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
              {constraint.coeffs.map((coeff, i) => (
                <input
                  key={i}
                  type="number"
                  value={coeff}
                  onChange={(e) => {
                    const newConstraints = [...constraints];
                    newConstraints[idx].coeffs[i] = parseFloat(e.target.value) || 0;
                    setConstraints(newConstraints);
                  }}
                  placeholder={`a${i+1}`}
                  style={{ width: '64px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                />
              ))}
              <select
                value={constraint.type}
                onChange={(e) => {
                  const newConstraints = [...constraints];
                  newConstraints[idx].type = e.target.value;
                  setConstraints(newConstraints);
                }}
                style={{ padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
              >
                <option value="<=">≤</option>
                <option value=">=">≥</option>
                <option value="=">=</option>
              </select>
              <input
                type="number"
                value={constraint.rhs}
                onChange={(e) => {
                  const newConstraints = [...constraints];
                  newConstraints[idx].rhs = parseFloat(e.target.value) || 0;
                  setConstraints(newConstraints);
                }}
                placeholder="b"
                style={{ width: '80px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
              />
              <button
                type="button"
                onClick={() => {
                  if (constraints.length > 1) {
                    const newConstraints = constraints.filter((_, i) => i !== idx);
                    setConstraints(newConstraints);
                    setNumConstraints(newConstraints.length);
                  }
                }}
                style={{
                  padding: '6px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: constraints.length > 1 ? 'block' : 'none'
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={solveSimplexMethod}
          style={{
            width: '100%',
            backgroundColor: '#2563eb',
            color: 'white',
            padding: '10px 16px',
            borderRadius: '4px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '500'
          }}
          onMouseOver={(e) => e.target.style.backgroundColor = '#1d4ed8'}
          onMouseOut={(e) => e.target.style.backgroundColor = '#2563eb'}
        >
          Розв'язати
        </button>
      </div>

      {iterations.length > 0 && (
        <div style={{ 
          backgroundColor: 'white', 
          border: '1px solid #e5e7eb', 
          borderRadius: '8px', 
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          color: 'black'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px' }}>
            Розв'язок
          </h2>
          
          {/* Display Input Problem */}
          <div style={{ marginBottom: '30px', padding: '16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px' }}>
              Вхідні дані задачі:
            </h3>
            <div style={{ fontFamily: 'monospace', fontSize: '16px', lineHeight: '1.6' }}>
              <p style={{ marginBottom: '8px' }}>
                <strong>Тип:</strong> {objective === 'max' ? 'Максимізація' : 'Мінімізація'}
              </p>
              <p style={{ marginBottom: '8px' }}>
                <strong>Цільова функція:</strong> F = {coefficients.map((c, i) =>
                  `${i > 0 ? (c >= 0 ? '+' : '') : ''}${c}x${i+1}`
                ).join('')} → {objective}
              </p>
              <div>
                <strong>Обмеження:</strong>
                {constraints.map((constraint, i) => (
                  <p key={i} style={{ margin: '4px 0', marginLeft: '16px' }}>
                    {constraint.coeffs.map((c, j) =>
                      `${j > 0 ? (c >= 0 ? '+' : '') : ''}${c}x${j+1}`
                    ).join('')} {constraint.type} {constraint.rhs}
                  </p>
                ))}
                <p style={{ margin: '4px 0', marginLeft: '16px' }}>
                  x₁, x₂ ≥ 0
                </p>
              </div>
            </div>
          </div>

          {iterations.map((iter, idx) => (
            <div key={idx} style={{ marginBottom: '30px' }}>
              {iter.iterationNum === -1 ? (
                <div>
                  {iter.modifiedObjectiveString && (
                     <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
                            Модифікована цільова функція (М-метод)
                        </h3>
                        <p style={{ fontFamily: 'monospace', fontSize: '16px' }}>
                            {iter.modifiedObjectiveString}
                        </p>
                        <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>
                            Оскільки в задачі є обмеження типу '≥' або '=', ми вводимо штучні змінні та модифікуємо цільову функцію, додаючи штраф 'M' (дуже велике число), щоб позбутися цих змінних в оптимальному розв'язку.
                        </p>
                    </div>
                  )}

                  {iter.transformations && iter.transformations.length > 0 && (
                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
                        Нормалізація обмежень
                      </h3>
                      <div style={{ backgroundColor: '#fef3c7', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
                        {iter.transformations.map((transform, tIdx) => (
                          <div key={tIdx} style={{ marginBottom: '12px' }}>
                            <p style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                              Обмеження {transform.index}:
                            </p>
                            <p style={{ margin: '4px 0', fontFamily: 'monospace' }}>
                              Було: {transform.original}
                            </p>
                            <p style={{ margin: '4px 0', fontFamily: 'monospace' }}>
                              Стало: {transform.transformed}
                            </p>
                            <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0' }}>
                              {transform.reason}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
                    Перетворення до стандартної форми
                  </h3>
                  <div style={{ backgroundColor: '#f0f9ff', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
                    {iter.standardFormTransformations.map((transform, tIdx) => (
                      <div key={tIdx} style={{ marginBottom: '16px' }}>
                        <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                          Обмеження {transform.index}:
                        </p>
                        <p style={{ margin: '4px 0', fontFamily: 'monospace', fontSize: '16px' }}>
                          {transform.original} → {transform.standardForm}
                        </p>
                        <div style={{ marginTop: '8px' }}>
                          <p style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
                            Введені змінні:
                          </p>
                          {transform.variables.map((variable, vIdx) => (
                            <p key={vIdx} style={{ fontSize: '14px', color: '#6b7280', margin: '2px 0', marginLeft: '16px' }}>
                              • {variable}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
                    {idx === 0 || (idx === 1 && iterations[0].iterationNum === -1) ? 'Початкова таблиця' : `Ітерація ${iter.iterationNum}`}
                  </h3>
              
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '14px'
                }}>
                  <thead>
                    {/* Coefficient row */}
                    <tr style={{ backgroundColor: '#e5e7eb' }}>
                      <th style={{ border: '1px solid #d1d5db', padding: '4px', fontSize: '12px' }}>Cj</th>
                      <th style={{ border: '1px solid #d1d5db', padding: '4px', fontSize: '12px' }}></th>
                      {tableData && tableData.cRow ? (
                        Array.from({ length: iter.tableau[0].length - 1 }, (_, i) => (
                          <th key={i} style={{ border: '1px solid #d1d5db', padding: '4px', fontSize: '12px' }}>
                            {formatNumber(tableData.cRow[i + 1] || 0)}
                          </th>
                        ))
                      ) : (
                        Array.from({ length: iter.tableau[0].length - 1 }, (_, i) => (
                          <th key={i} style={{ border: '1px solid #d1d5db', padding: '4px', fontSize: '12px' }}>
                            {i < numVars ? (tableData ? formatNumber(tableData.objCoeffs[i] || 0) : '0') : '0'}
                          </th>
                        ))
                      )}
                    </tr>
                    {/* Variable labels row */}
                    <tr style={{ backgroundColor: '#f3f4f6' }}>
                      <th style={{ border: '1px solid #d1d5db', padding: '8px' }}>Bx</th>
                      <th style={{ border: '1px solid #d1d5db', padding: '8px' }}>A₀</th>
                      {Array.from({ length: numVars }, (_, i) => (
                        <th key={i} style={{ border: '1px solid #d1d5db', padding: '8px' }}>
                          A{i+1}
                        </th>
                      ))}
                      {Array.from({ length: iter.tableau[0].length - numVars - 1 }, (_, i) => (
                        <th key={i} style={{ border: '1px solid #d1d5db', padding: '8px' }}>
                          A{numVars + i + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {iter.tableau.map((row, i) => {
                      const basisVar = iter.basis[i];
                      // A variable is "new" if it wasn't in the initial basis
                      const isNewToBasis = iterations.length > 0 && iterations[0].basis ?
                        !iterations[0].basis.includes(basisVar) : false;
                      const basisCoeff = iter.cB[i];

                      return (
                      <tr key={i} style={{
                        backgroundColor: iter.pivotRow === i ? '#fef3c7' : 'white'
                      }}>
                        <td style={{
                          border: '1px solid #d1d5db',
                          padding: '8px',
                          fontWeight: '500',
                          color: isNewToBasis ? '#dc2626' : 'black'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>{formatNumber(basisCoeff)}</span>
                            <span style={{ color: isNewToBasis ? '#dc2626' : 'black' }}>
                              x{basisVar + 1}
                            </span>
                          </div>
                        </td>
                        {row.map((val, j) => (
                          <td 
                            key={j} 
                            style={{ 
                              border: '1px solid #d1d5db', 
                              padding: '8px',
                              textAlign: 'center',
                              backgroundColor: iter.pivotCol === j && iter.pivotRow === i ? '#86efac' : '',
                              fontWeight: iter.pivotCol === j && iter.pivotRow === i ? 'bold' : 'normal'
                            }}
                          >
                            {formatNumber(val)}
                          </td>
                        ))}
                      </tr>
                      );
                    })}
                    <tr style={{ backgroundColor: '#f9fafb', fontWeight: '500' }}>
                      <td style={{ border: '1px solid #d1d5db', padding: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span></span>
                          <span>Δ</span>
                        </div>
                      </td>
                      {iter.deltaRow.map((val, j) => (
                        <td 
                          key={j} 
                          style={{ 
                            border: '1px solid #d1d5db', 
                            padding: '8px',
                            textAlign: 'center',
                            backgroundColor: iter.pivotCol === j ? '#bfdbfe' : ''
                          }}
                        >
                          {formatNumber(val)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
                </div>
              )}
            </div>
          ))}

          {solution && (
            <div style={{ 
              marginTop: '30px',
              padding: '16px',
              backgroundColor: '#f0fdf4',
              border: '1px solid #86efac',
              borderRadius: '8px'
            }}>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
                Оптимальний розв'язок:
              </h3>
              <div>
                {solution.variables.map((val, i) => (
                  <p key={i} style={{ margin: '4px 0' }}>
                    x<sub>{i+1}</sub> = {formatNumber(val)}
                  </p>
                ))}
                <p style={{ fontWeight: 'bold', marginTop: '10px' }}>
                  F = {formatNumber(solution.objectiveValue)}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SimplexCalculator;

