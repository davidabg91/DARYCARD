import fs from 'fs';

const filePath = 'D:\\DARY\\src\\pages\\AdminPanel.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings to LF for replacement, then we will restore CRLF
const normalized = content.replace(/\r\n/g, '\n');

const summaryBlock = `<div style={{ background: '#f8f9fa', borderLeft: '4px solid #000', borderTop: '1px solid #e9ecef', borderRight: '1px solid #e9ecef', borderBottom: '1px solid #e9ecef', padding: '1.2rem', borderRadius: '4px', marginBottom: '1.8rem', fontSize: '13px', lineHeight: '1.6', color: '#222' }}>
                                            <h4 style={{ margin: '0 0 0.4rem 0', color: '#000', fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>ОФИЦИАЛНО ОБОБЩЕНИЕ</h4>
                                            {useRegisterPrint ? (
                                                <span>
                                                    Генерираният регистър за община <strong>{registerMunicipalityLabel}</strong> обхваща общо <strong>{filteredReportClients.length}</strong> издадени карти за периода <strong>{registerPeriodLabel}</strong>. 
                                                    Общата стойност на издадените абонаментни карти възлиза на <strong>{totalReportRevenue.toFixed(2)} €</strong>. 
                                                    Данните са извлечени директно от електронната система и служат за официално отчитане на превозните документи.
                                                </span>
                                            ) : (
                                                <span>
                                                    Официалният финансов отчет обхваща общо <strong>{filteredReportClients.length}</strong> регистрирани транзакции/плащания, съответстващи на посочените по-горе критерии и филтри. 
                                                    Общата инкасирана сума за отчетения период възлиза на <strong>{totalReportRevenue.toFixed(2)} €</strong>. 
                                                    Документът е генериран за нуждите на вътрешния счетоводен контрол и финансово отчитане.
                                                </span>
                                            )}
                                        </div>`;

const normalizedSummary = summaryBlock.replace(/\r\n/g, '\n');

if (normalized.includes(normalizedSummary)) {
    console.log("Found Official Summary block! Removing...");
    const replaced = normalized.replace(normalizedSummary, '');
    const restored = replaced.replace(/\n/g, '\r\n');
    fs.writeFileSync(filePath, restored, 'utf8');
    console.log("AdminPanel.tsx updated successfully!");
} else {
    console.error("Could not find the Official Summary block in AdminPanel.tsx!");
}
