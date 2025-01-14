CREATE OR REPLACE FUNCTION public.kartoza_census_kemendagri_populate_census() RETURNS trigger
    LANGUAGE plpgsql
AS $$
BEGIN
    insert into census
    (population, elderly, females, males, unemployed, village_id)
        (select
             new.jumlah_pen,
             -- Elderly is defined to be age over 65
             new.u65 + new.u70 + new.u75,
             new.pria,
             new.wanita,
             new.p01_belum_,
             a.village_id
         from mv_administrative_mapping a
         where
             new.nama_kab_s ilike a.district_name
             and new.nama_kec_s ilike a.sub_district_name
             and new.nama_kel_s ilike a.village_name
        ) ON CONFLICT (village_id)
            DO UPDATE
            SET
                population = excluded.population,
                elderly = excluded.elderly,
                males = excluded.males,
                females = excluded.females,
                unemployed = excluded.unemployed;
    RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION public.kartoza_census_kemendagri_populate_all_census() RETURNS VARCHAR
    LANGUAGE plpgsql
AS $$
BEGIN
    insert into census
    (population, elderly, females, males, unemployed, village_id)
        (select
             c.jumlah_pen,
             -- Elderly is defined to be age over 65
             c.u65 + c.u70 + c.u75,
             c.pria,
             c.wanita,
             c.p01_belum_,
             a.village_id
         from census_kemendagri c join mv_administrative_mapping a
         on
             c.nama_kab_s ilike a.district_name
             and c.nama_kec_s ilike a.sub_district_name
             and c.nama_kel_s ilike a.village_name
        ) ON CONFLICT (village_id)
            DO UPDATE
            SET
                population = excluded.population,
                elderly = excluded.elderly,
                males = excluded.males,
                females = excluded.females,
                unemployed = excluded.unemployed;
    RETURN 'OK';
END
$$;

