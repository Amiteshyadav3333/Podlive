const getAgeGroup = (birthDate, now = new Date()) => {
    if (!birthDate) return null;
    const date = birthDate instanceof Date ? birthDate : new Date(birthDate);
    if (Number.isNaN(date.getTime()) || date > now) return null;

    let age = now.getUTCFullYear() - date.getUTCFullYear();
    const beforeBirthday = now.getUTCMonth() < date.getUTCMonth()
        || (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() < date.getUTCDate());
    if (beforeBirthday) age -= 1;
    if (age < 13) return 'under_13';
    if (age <= 17) return '13_17';
    if (age <= 24) return '18_24';
    if (age <= 34) return '25_34';
    if (age <= 44) return '35_44';
    if (age <= 54) return '45_54';
    if (age <= 64) return '55_64';
    return '65_plus';
};

module.exports = { getAgeGroup };
