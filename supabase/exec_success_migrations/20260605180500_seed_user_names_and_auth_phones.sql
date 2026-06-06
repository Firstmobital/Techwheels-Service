-- Authoritative schema basis (from local dump):
-- - public.users(full_name, email)
-- - auth.users(phone, email)
-- - auth.users has UNIQUE(phone) via users_phone_key

BEGIN;

CREATE TEMP TABLE _seed_user_profile (
  name text NOT NULL,
  email text NOT NULL,
  phone_raw text
) ON COMMIT DROP;

INSERT INTO _seed_user_profile (name, email, phone_raw)
VALUES
  ('Admin','admin@firstmobital.com','9929300000'),
  ('Akash kumawat','akash.techweels@gmail.com','8233220608'),
  ('Aman gupta','aman.techwheels@gmail.com','8824885029'),
  ('ANIL KUMAR SHARMA','anilberojya2015@gmail.com','9610105862'),
  ('arihant jain','a6.techwheels@gmail.com','9116667239'),
  ('Arvind kumar sharma','arvindkr.sharma1996@gmail.com','8562001376'),
  ('Aslam Khan','aslamkhan946126@gmail.com','9461260693'),
  ('Bajrang yadav','bajranglalyadav1@gmail.com','9928004134'),
  ('Banty jonwal','bantyjonwal725@gmail.com','7610858595'),
  ('Brajesh sharma','pbk.techwheels@gmail.com','9257051603'),
  ('Dashrath Saini','bodyshop.techwheels@gmail.com','9672846469'),
  ('Deepak Saini','dsaini14220@gmail.com','8559894587'),
  ('Deepak Sharma','deepak10361@gmail.com','7023344444'),
  ('Govind Singh','service@techwheels.in','9116667274'),
  ('JITENDRA SINGH','pjs1.techwheels@gmail.com','9257034016'),
  ('Mohan Lal Gujar','mohan.techwheels@gmail.com','9314722073'),
  ('Mukesh Bairwa','mukeshlodwal1990@gmail.com','9694254506'),
  ('Mukesh samota','mukeshjat067@gmail.com','8104059251'),
  ('Mukesh sharma','sharmamukesh4359@gmail.com','8078652344'),
  ('Neha Saini','nehanlsaini@gmail.com','-'),
  ('PANKAJ SHARMA`','pankajsharma9610602107@gmail.com','8005729349'),
  ('PANKAJ SINGH','ps2.techwheels@gmail.com','9116667297'),
  ('PAVAN BHARGAVA','pb1.techwheels@gmail.com','9116667295'),
  ('payal makhija','customercare.techwheels@gmail.com','9116667274'),
  ('RADHESHYAM BAIRWA','radheshyambairwa38@gmail.com','-'),
  ('Rajesh Sharma','rajshreegour55@gmail.com','8952833444'),
  ('Ramavtar saini','atikshmasainimali@gmail.com','-'),
  ('Riteshmamodiya','ritesh@indiraswitch.com','9929300000'),
  ('Sagar Prajapat','sagarparjapathe9694@gmail.com','9694886956'),
  ('Sanjay choudhary','pvfloortechwheels@gmail.com','9649494493'),
  ('Shashank pandey','pandeyshashank1010@gmail.com','7740949034'),
  ('Sitaram Parjapat','sitaramparjapat9397@gmail.com','9610484897'),
  ('Sohan Advani','sohan.indiraswitch@gmail.com','8094799997'),
  ('SUNIL SHARMA','ss1.techwheels@gmail.com','7424926980'),
  ('Veika meena','avanimeena4560@gmail.com','6377354560'),
  ('VIJENDRA KP','vk1.techwheels@gmail.com','9116667280'),
  ('Vijendra Singh jesawat','evfloor.techwheels@gmail.com','9887623329'),
  ('Vinita meena','vinitameena4560@gmail.com','6377354560'),
  ('Vinod Kumar Bijarnia','vinod.k.bijarnia@rajasthan.in','9782388882'),
  ('Vinod Test','vinodexodus@gmail.com','9782388882'),
  ('YOGENDERA SINGH SHEKHAWAT','pys2.techwheels@gmail.com','9257034019'),
  ('YUGANTER','ys.techwheels@gmail.com','9257051607');

-- Update display names in public.users by email.
UPDATE public.users u
SET full_name = s.name
FROM (
  SELECT
    btrim(name) AS name,
    lower(btrim(email)) AS email
  FROM _seed_user_profile
) s
WHERE lower(u.email) = s.email
  AND u.full_name IS DISTINCT FROM s.name;

-- Update auth.users.phone by email, respecting users_phone_key uniqueness.
WITH normalized AS (
  SELECT
    lower(btrim(email)) AS email,
    CASE
      WHEN NULLIF(regexp_replace(COALESCE(phone_raw, ''), '[^0-9]', '', 'g'), '') ~ '^[0-9]{10}$'
      THEN regexp_replace(phone_raw, '[^0-9]', '', 'g')
      ELSE NULL
    END AS phone
  FROM _seed_user_profile
),
input_dupes AS (
  SELECT phone
  FROM normalized
  WHERE phone IS NOT NULL
  GROUP BY phone
  HAVING COUNT(*) > 1
),
eligible AS (
  SELECT n.email, n.phone
  FROM normalized n
  WHERE n.phone IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM input_dupes d WHERE d.phone = n.phone
    )
    AND NOT EXISTS (
      SELECT 1
      FROM auth.users au_conflict
      WHERE au_conflict.phone = n.phone
        AND lower(au_conflict.email) <> n.email
    )
)
UPDATE auth.users au
SET phone = e.phone
FROM eligible e
WHERE lower(au.email) = e.email
  AND au.phone IS DISTINCT FROM e.phone;

COMMIT;
